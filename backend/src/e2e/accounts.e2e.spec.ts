import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { transactions } from "../database/schema.js";
import { FakeTatum, createTestApp, csvForm, signIn, type TestApp, type TestClient } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** A bank statement with a running balance: closes at 1000 two days ago. */
const EVERYDAY = [
  "Date,Description,Amount,Balance",
  `${daysAgo(40)},Old purchase,-20,600`,
  `${daysAgo(10)},Salary,500,1100`,
  `${daysAgo(2)},Groceries,-100,1000`,
].join("\n");

const NO_BALANCE = ["Date,Description,Amount", `${daysAgo(5)},Coffee,-4`].join("\n");

describe("accounts and balances", () => {
  let database: TestDatabase;
  let api: TestApp;
  let tatum: FakeTatum;

  before(async () => {
    database = await createTestDatabase();
    tatum = new FakeTatum();
    api = await createTestApp({ database, tatum });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  async function newUser() {
    const client = api.client();
    const { address } = await signIn(client);
    return { client, address };
  }

  async function importStatement(client: TestClient, csv: string, accountName: string) {
    const res = await client.request("POST", "/transactions/import", { form: csvForm(csv, "statement.csv", { accountName }) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.account as { id: string; name: string; balance: number | null };
  }

  it("captures the closing balance from the statement and shows it in the preview", async () => {
    const { client } = await newUser();
    const preview = await client.request("POST", "/transactions/import?preview=1", { form: csvForm(EVERYDAY) });
    assert.equal(preview.body.closingBalance, 1000);
    assert.equal(preview.body.columns.balance, "Balance");

    const account = await importStatement(client, EVERYDAY, "Everyday");
    assert.equal(account.balance, 1000);
    assert.equal((await importStatement(client, NO_BALANCE, "Cash")).balance, null);
  });

  it("lists accounts with their transactions and the live Sui wallet", async () => {
    const { client, address } = await newUser();
    tatum.balances.set(address, "1032.4");
    await importStatement(client, EVERYDAY, "Everyday");
    await importStatement(client, NO_BALANCE, "Cash");

    const res = await client.get("/accounts");
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.accounts.map((a: Record<string, unknown>) => [a.name, a.kind, a.balance, a.transactionCount, a.lastTransactionDate]),
      [
        ["Cash", "csv", null, 1, daysAgo(5)],
        ["Everyday", "csv", 1000, 3, daysAgo(2)],
      ],
    );
    assert.ok(res.body.accounts.every((a: { syncedAt: string }) => !Number.isNaN(Date.parse(a.syncedAt))));
    assert.deepEqual({ ...res.body.wallet, syncedAt: undefined }, { address, usdc: 1032.4, status: "live", syncedAt: undefined });
  });

  it("totals known balances plus the wallet, lists what's missing, and builds a 30-day trend", async () => {
    const { client, address } = await newUser();
    tatum.balances.set(address, "50.25");
    await importStatement(client, EVERYDAY, "Everyday");
    const cash = await importStatement(client, NO_BALANCE, "Cash");

    const summary = (await client.get("/accounts/summary")).body;
    assert.equal(summary.currency, "USD");
    assert.equal(summary.banks, 1000);
    assert.equal(summary.total, 1050.25);
    assert.equal(summary.wallet.status, "live");
    assert.deepEqual(summary.missing, [{ id: cash.id, name: "Cash", reason: "balance_unknown" }]);

    // 30 daily points ending today. Today and the two days before end at 1000; before the -100
    // groceries it was 1100; before the +500 salary it was 600. The 40-day-old row is outside the window.
    assert.equal(summary.trend.length, 30);
    const at = (n: number) => summary.trend.find((p: { date: string }) => p.date === daysAgo(n)).balance;
    assert.equal(summary.trend[29].date, daysAgo(0));
    assert.equal(at(0), 1000);
    assert.equal(at(2), 1000);
    assert.equal(at(3), 1100);
    assert.equal(at(10), 1100);
    assert.equal(at(11), 600);
    assert.equal(at(29), 600);
    assert.equal(summary.change30d, 400);
  });

  it("reports the wallet as missing instead of guessing when Tatum fails", async () => {
    const { client } = await newUser();
    await importStatement(client, EVERYDAY, "Everyday");
    tatum.failing = true;
    try {
      const summary = (await client.get("/accounts/summary")).body;
      assert.equal(summary.total, 1000);
      assert.deepEqual(summary.wallet.usdc, null);
      assert.deepEqual(summary.missing, [{ id: null, name: "Sui wallet", reason: "unavailable" }]);
      assert.equal((await client.get("/accounts")).status, 200, "listing still works during a Tatum outage");
    } finally {
      tatum.failing = false;
    }
  });

  it("has no total or trend until something has a known balance", async () => {
    const { client } = await newUser();
    tatum.failing = true;
    try {
      await importStatement(client, NO_BALANCE, "Cash");
      const summary = (await client.get("/accounts/summary")).body;
      assert.equal(summary.total, null);
      assert.equal(summary.banks, null);
      assert.deepEqual(summary.trend, []);
      assert.equal(summary.change30d, null);
    } finally {
      tatum.failing = false;
    }
  });

  it("renames an account and sets or clears its balance", async () => {
    const { client } = await newUser();
    const account = await importStatement(client, NO_BALANCE, "Cash");

    const renamed = await client.patch(`/accounts/${account.id}`, { name: "Wallet cash" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, "Wallet cash");
    assert.equal(renamed.body.balance, null);

    assert.equal((await client.patch(`/accounts/${account.id}`, { balance: -45.5 })).body.balance, -45.5);
    assert.equal((await client.get("/accounts/summary")).body.banks, -45.5);
    assert.equal((await client.patch(`/accounts/${account.id}`, { balance: null })).body.balance, null);
  });

  it("validates account updates", async () => {
    const { client } = await newUser();
    const account = await importStatement(client, NO_BALANCE, "Cash");
    assert.equal((await client.patch(`/accounts/${account.id}`, {})).status, 400);
    assert.equal((await client.patch(`/accounts/${account.id}`, { name: "" })).status, 400);
    assert.equal((await client.patch(`/accounts/${account.id}`, { balance: "lots" })).status, 400);
    assert.equal((await client.patch("/accounts/not-a-uuid", { name: "x" })).status, 400);
    assert.equal((await client.patch("/accounts/00000000-0000-0000-0000-000000000000", { name: "x" })).status, 404);
  });

  it("deletes an account with the transactions imported into it, and nothing else", async () => {
    const { client, address } = await newUser();
    const everyday = await importStatement(client, EVERYDAY, "Everyday");
    const cash = await importStatement(client, NO_BALANCE, "Cash");

    const res = await client.delete(`/accounts/${everyday.id}`);
    assert.deepEqual(res.body, { id: everyday.id, deleted: true, transactionsDeleted: 3 });
    assert.deepEqual(
      (await client.get("/accounts")).body.accounts.map((a: { id: string }) => a.id),
      [cash.id],
    );
    const left = await database.db.select().from(transactions).where(eq(transactions.userAddress, address));
    assert.deepEqual(
      left.map((t) => t.merchant),
      ["Coffee"],
    );
    assert.equal((await client.delete(`/accounts/${everyday.id}`)).status, 404);
  });

  it("never shows or changes another user's accounts", async () => {
    const owner = await newUser();
    const other = await newUser();
    const account = await importStatement(owner.client, EVERYDAY, "Everyday");

    assert.deepEqual((await other.client.get("/accounts")).body.accounts, []);
    assert.equal((await other.client.get("/accounts/summary")).body.banks, null);
    assert.equal((await other.client.patch(`/accounts/${account.id}`, { name: "Mine now" })).status, 404);
    assert.equal((await other.client.delete(`/accounts/${account.id}`)).status, 404);

    const mine = (await owner.client.get("/accounts")).body.accounts[0];
    assert.equal(mine.name, "Everyday");
    assert.equal(mine.transactionCount, 3);
  });

  it("returns the wallet balance as a number as well as an exact string", async () => {
    const { client, address } = await newUser();
    tatum.balances.set(address, "1032.4");
    const res = await client.get("/wallet/balance");
    assert.equal(res.status, 200);
    assert.equal(res.body.usdc, "1032.4");
    assert.equal(res.body.amount, 1032.4);
    assert.equal(typeof res.body.amount, "number");
  });

  it("uses the demo's sample balances and never reads a demo address from Tatum", async () => {
    const client = api.client();
    await client.post("/auth/demo");
    const calls = tatum.calls;

    const summary = (await client.get("/accounts/summary")).body;
    assert.equal(summary.banks, 3186);
    assert.equal(summary.total, 3186);
    assert.equal(summary.wallet.status, "skipped_demo");
    assert.equal(summary.trend.length, 30);
    assert.equal((await client.get("/accounts")).body.accounts.length, 2);
    assert.equal(tatum.calls, calls);
  });

  it("requires a session", async () => {
    const client = api.client();
    for (const [method, path] of [
      ["GET", "/accounts"],
      ["GET", "/accounts/summary"],
      ["PATCH", "/accounts/00000000-0000-0000-0000-000000000000"],
      ["DELETE", "/accounts/00000000-0000-0000-0000-000000000000"],
    ]) {
      assert.equal((await client.request(method, path, method === "PATCH" ? { json: { name: "x" } } : {})).status, 401, path);
    }
  });
});

describe("accounts without Tatum", () => {
  it("say the wallet isn't configured", async () => {
    const database = await createTestDatabase();
    const api = await createTestApp({ database });
    try {
      const client = api.client();
      await signIn(client);
      const res = await client.get("/accounts");
      assert.equal(res.body.wallet.status, "not_configured");
      assert.equal(res.body.wallet.usdc, null);
      assert.deepEqual((await client.get("/accounts/summary")).body.missing, [{ id: null, name: "Sui wallet", reason: "not_configured" }]);
    } finally {
      await api.close();
      await database.close();
    }
  });
});

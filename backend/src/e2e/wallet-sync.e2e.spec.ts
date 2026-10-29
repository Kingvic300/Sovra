import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { accounts, transactions } from "../database/schema.js";
import { FakeAi, FakeSuiGraphQL, createTestApp, signIn, tatumWithFakeChain, type TestApp, type TestClient } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";
import { suiMerchantKey } from "../wallet/wallet-sync.service.js";

const SHOP = `0x${"5".repeat(64)}`;
const EMPLOYER = `0x${"e".repeat(64)}`;
const LANDLORD = `0x${"1a".repeat(32)}`;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const day = (daysAgo: number) => at(daysAgo).slice(0, 10);

let digests = 0;
const nextDigest = () => `digest-${++digests}`;

describe("Sui USDC sync", () => {
  let database: TestDatabase;
  let api: TestApp;
  let chain: FakeSuiGraphQL;
  let ai: FakeAi;

  before(async () => {
    database = await createTestDatabase();
    chain = new FakeSuiGraphQL();
    ai = new FakeAi();
    api = await createTestApp({ database, ai, tatum: tatumWithFakeChain(chain) });
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

  const rowsOf = (address: string) => database.db.select().from(transactions).where(eq(transactions.userAddress, address));
  const sync = (client: TestClient) => client.post("/wallet/sync");

  it("imports USDC in and out of the wallet into one Sui account, skipping what can't be counted", async () => {
    const { client, address } = await newUser();
    chain.balances.set(address, "1032.4");
    chain.transfer({ digest: "pay-1", from: EMPLOYER, to: address, usdc: 650, at: at(20) });
    chain.transfer({ digest: "shop-1", from: address, to: SHOP, usdc: 12.5, at: at(5) });
    chain.transfer({ digest: "failed-1", from: address, to: SHOP, usdc: 99, at: at(4), status: "FAILURE" });
    chain.transfer({ digest: "dust-1", from: EMPLOYER, to: address, usdc: 0.004, at: at(3) });
    chain.transfer({ digest: "sui-gas", from: address, to: SHOP, usdc: 1, at: at(2), coin: "0x2::sui::SUI" });

    const res = await sync(client);
    assert.equal(res.status, 200);
    assert.equal(res.body.imported, 2);
    assert.equal(res.body.alreadyImported, 0);
    assert.deepEqual(res.body.skipped, { failed: 1, undated: 0, dust: 1 });
    assert.equal(res.body.complete, true);
    assert.equal(res.body.balanceStatus, "updated");
    assert.deepEqual({ ...res.body.account, id: undefined, syncedAt: undefined }, { id: undefined, kind: "sui", name: "Sui wallet", balance: 1032.4, syncedAt: undefined });

    const rows = (await rowsOf(address)).sort((a, b) => a.date.localeCompare(b.date));
    assert.deepEqual(
      rows.map((r) => [r.date, r.merchant, r.amount, r.category, r.externalId, r.merchantKey]),
      [
        [day(20), "USDC from 0xeeee…eeee", "650.00", "income", "pay-1", suiMerchantKey(EMPLOYER)],
        [day(5), "USDC to 0x5555…5555", "-12.50", "transfer", "shop-1", suiMerchantKey(SHOP)],
      ],
    );
    assert.ok(rows.every((r) => r.accountId === res.body.account.id));
    assert.equal(rows[1].raw?.amountUsdc, "12.5");

    const listed = (await client.get("/accounts")).body.accounts;
    assert.deepEqual(
      listed.map((a: { kind: string; balance: number; transactionCount: number }) => [a.kind, a.balance, a.transactionCount]),
      [["sui", 1032.4, 2]],
    );
  });

  it("never duplicates transfers when syncing again, and only reads what's new", async () => {
    const { client, address } = await newUser();
    chain.transfer({ digest: nextDigest(), from: address, to: SHOP, usdc: 10, at: at(9) });
    chain.transfer({ digest: nextDigest(), from: address, to: SHOP, usdc: 11, at: at(8) });
    assert.equal((await sync(client)).body.imported, 2);

    const again = await sync(client);
    assert.equal(again.body.imported, 0);
    assert.equal(again.body.alreadyImported, 2);
    assert.equal(again.body.pagesRead, 1);
    assert.equal((await rowsOf(address)).length, 2);

    chain.transfer({ digest: nextDigest(), from: address, to: SHOP, usdc: 12, at: at(1) });
    const third = await sync(client);
    assert.equal(third.body.imported, 1);
    assert.equal((await rowsOf(address)).length, 3);
    assert.equal(
      (await database.db.select().from(accounts).where(and(eq(accounts.userAddress, address), eq(accounts.kind, "sui")))).length,
      1,
      "one Sui account however often you sync",
    );
  });

  it("stays consistent when two syncs run at once", async () => {
    const { client, address } = await newUser();
    for (let i = 0; i < 5; i++) chain.transfer({ digest: nextDigest(), from: EMPLOYER, to: address, usdc: 5 + i, at: at(10 - i) });
    const results = await Promise.all([sync(client), sync(client)]);
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(results[0].body.imported + results[1].body.imported, 5);
    assert.equal((await rowsOf(address)).length, 5);
    assert.equal((await database.db.select().from(accounts).where(eq(accounts.userAddress, address))).length, 1);
  });

  it("applies learned category rules to a counterparty's transfers", async () => {
    const { client, address } = await newUser();
    chain.transfer({ digest: nextDigest(), from: address, to: LANDLORD, usdc: 225, at: at(30) });
    await sync(client);
    const [rent] = (await client.get("/transactions")).body.transactions;
    const learned = await client.patch(`/transactions/${rent.id}`, { category: "bills", remember: true });
    assert.equal(learned.status, 200);

    chain.transfer({ digest: nextDigest(), from: address, to: LANDLORD, usdc: 225, at: at(1) });
    await sync(client);
    const rows = await rowsOf(address);
    assert.deepEqual(
      rows.map((r) => r.category),
      ["bills", "bills"],
    );
  });

  it("feeds synced transfers into budgets, recurring charges, account totals and Ask", async () => {
    const { client, address } = await newUser();
    chain.balances.set(address, "300");
    for (const daysAgo of [65, 35, 5]) chain.transfer({ digest: nextDigest(), from: address, to: LANDLORD, usdc: 225, at: at(daysAgo) });
    await sync(client);

    // Budgets: this month's rent share counts as spending.
    await client.put("/budgets/transfer", { limit: 300 });
    const month = day(5).slice(0, 7);
    const budget = (await client.get(`/budgets?month=${month}`)).body.budgets.find((b: { category: string }) => b.category === "transfer");
    assert.equal(budget.spent, 225);

    // Recurring: the monthly transfer is detected per counterparty.
    const recurring = (await client.get("/recurring")).body.recurring;
    assert.equal(recurring.length, 1);
    assert.equal(recurring[0].merchant, "USDC to 0x1a1a…1a1a");
    assert.equal(recurring[0].cadence, "monthly");

    // Accounts: the Sui balance is counted once.
    const summary = (await client.get("/accounts/summary")).body;
    assert.equal(summary.total, 300);
    assert.equal(summary.banks, null);
    assert.deepEqual(summary.missing, []);

    // Ask: synced transfers are part of the context.
    await client.post("/ask", { question: "Where did my USDC go?" });
    const context = ai.answers.at(-1)!.context as { recentTransactions?: { merchant: string }[]; upcomingBills?: { merchant: string }[] };
    assert.ok(context.recentTransactions?.some((t) => t.merchant === "USDC to 0x1a1a…1a1a"));
    assert.ok(context.upcomingBills?.some((b) => b.merchant === "USDC to 0x1a1a…1a1a"));
  });

  it("uses the last synced balance when a live read fails, without counting it twice", async () => {
    const { client, address } = await newUser();
    chain.balances.set(address, "80");
    chain.transfer({ digest: nextDigest(), from: EMPLOYER, to: address, usdc: 80, at: at(3) });
    await sync(client);

    chain.failBalances = true;
    try {
      const summary = (await client.get("/accounts/summary")).body;
      assert.equal(summary.total, 80, "falls back to the synced balance");
      assert.equal(summary.wallet.status, "unavailable");
      assert.deepEqual(summary.missing, []);

      chain.transfer({ digest: nextDigest(), from: EMPLOYER, to: address, usdc: 20, at: at(1) });
      const res = await sync(client);
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 1, "transfers are saved even if the balance read fails");
      assert.equal(res.body.balanceStatus, "unavailable");
      assert.equal(res.body.account.balance, 80, "keeps the last known balance");
    } finally {
      chain.failBalances = false;
    }
  });

  it("answers 502 when Tatum fails and leaves no transfers half-imported", async () => {
    const { client, address } = await newUser();
    chain.transfer({ digest: nextDigest(), from: EMPLOYER, to: address, usdc: 1, at: at(1) });
    chain.failQueries = true;
    try {
      const res = await sync(client);
      assert.equal(res.status, 502);
      assert.equal(res.body.error.code, "upstream_failed");
      assert.equal((await rowsOf(address)).length, 0);
    } finally {
      chain.failQueries = false;
    }
    assert.equal((await sync(client)).body.imported, 1, "a retry picks it up");
  });

  it("only ever reads the signed-in user's own address", async () => {
    const owner = await newUser();
    const other = await newUser();
    chain.transfer({ digest: nextDigest(), from: owner.address, to: SHOP, usdc: 40, at: at(2) });
    await sync(owner.client);

    const res = await sync(other.client);
    assert.equal(res.body.imported, 0);
    assert.equal((await rowsOf(other.address)).length, 0);
    const [ownerTx] = (await owner.client.get("/transactions")).body.transactions;
    assert.equal((await other.client.patch(`/transactions/${ownerTx.id}`, { category: "food" })).status, 404);
    assert.deepEqual((await other.client.get("/transactions")).body.transactions, []);
  });

  it("refuses demo accounts without calling Tatum", async () => {
    const client = api.client();
    await client.post("/auth/demo");
    const queries = chain.queries;
    const res = await sync(client);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "demo_not_supported");
    assert.equal(chain.queries, queries);
  });

  it("refuses email accounts, which have no wallet, without calling Tatum", async () => {
    const client = api.client();
    await client.post("/auth/signup", { email: `sync-${Date.now()}@example.com`, password: "long enough password" });
    const queries = chain.queries;
    const res = await sync(client);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "no_wallet");
    assert.equal(chain.queries, queries);
  });

  it("requires a session", async () => {
    assert.equal((await api.client().post("/wallet/sync")).status, 401);
  });
});

describe("Sui USDC sync over long histories", () => {
  it("imports history in bounded chunks across syncs, without gaps or duplicates", async () => {
    const database = await createTestDatabase();
    const chain = new FakeSuiGraphQL();
    const api = await createTestApp({ database, tatum: tatumWithFakeChain(chain), env: { WALLET_SYNC_MAX_PAGES: "2" } });
    try {
      const client = api.client();
      const { address } = await signIn(client);
      for (let i = 0; i < 130; i++) chain.transfer({ digest: `old-${i}`, from: EMPLOYER, to: address, usdc: 1, at: at(200 - i) });

      const first = (await client.post("/wallet/sync")).body;
      assert.deepEqual([first.imported, first.pagesRead, first.complete], [100, 2, false]);

      // New transfers arrive before the next sync.
      for (let i = 0; i < 3; i++) chain.transfer({ digest: `new-${i}`, from: EMPLOYER, to: address, usdc: 2, at: at(1) });
      const second = (await client.post("/wallet/sync")).body;
      assert.equal(second.imported, 3);
      assert.equal(second.complete, false, "the older history is still waiting");

      const third = (await client.post("/wallet/sync")).body;
      assert.equal(third.imported, 30);
      assert.equal(third.complete, true);

      const rows = await database.db.select().from(transactions).where(eq(transactions.userAddress, address));
      assert.equal(rows.length, 133);
      assert.equal(new Set(rows.map((r) => r.externalId)).size, 133);
      assert.equal((await client.post("/wallet/sync")).body.imported, 0);
    } finally {
      await api.close();
      await database.close();
    }
  });

  it("is rate limited per user", async () => {
    const database = await createTestDatabase();
    const api = await createTestApp({ database, tatum: tatumWithFakeChain(new FakeSuiGraphQL()), env: { RATE_LIMIT_WALLET_SYNC_PER_HOUR: "1" } });
    try {
      const client = api.client();
      await signIn(client);
      assert.equal((await client.post("/wallet/sync")).status, 200);
      const blocked = await client.post("/wallet/sync");
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, "rate_limited");
    } finally {
      await api.close();
      await database.close();
    }
  });

  it("answers 503 without a Tatum key", async () => {
    const database = await createTestDatabase();
    const api = await createTestApp({ database });
    try {
      const client = api.client();
      const { address } = await signIn(client);
      const res = await client.post("/wallet/sync");
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, "not_configured");
      assert.equal((await database.db.select().from(accounts).where(eq(accounts.userAddress, address))).length, 0);
    } finally {
      await api.close();
      await database.close();
    }
  });
});

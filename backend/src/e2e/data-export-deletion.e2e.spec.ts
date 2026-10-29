import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { eq, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../database/schema.js";
import { authNonces, budgetSuggestionDecisions, users } from "../database/schema.js";
import { NOT_EXPORTED, USER_DATA_TABLES } from "../me/user-data.js";
import { recurringId } from "../recurring/recurring.module.js";
import {
  FakeAi,
  FakeMemWal,
  FakeSuiGraphQL,
  createTestApp,
  csvForm,
  flushBackgroundWork,
  signIn,
  tatumWithFakeChain,
  type TestApp,
  type TestClient,
} from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const STATEMENT = ["Date,Description,Amount", ...[-89, -59, -29].map((n) => `${day(n)},Netflix,-17.99`), `${day(-1)},Amazon,-30`].join("\n");

describe("data export and account deletion", () => {
  let database: TestDatabase;
  let api: TestApp;
  let memwal: FakeMemWal;
  let chain: FakeSuiGraphQL;

  before(async () => {
    database = await createTestDatabase();
    memwal = new FakeMemWal();
    chain = new FakeSuiGraphQL();
    api = await createTestApp({ database, memwal, ai: new FakeAi(), tatum: tatumWithFakeChain(chain) });
  });

  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  const countFor = async (address: string) => {
    const counts: Record<string, number> = {};
    for (const [name, { table, owner }] of Object.entries(USER_DATA_TABLES)) {
      const [{ n }] = await database.db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(owner, address));
      counts[name] = Number(n);
    }
    return counts;
  };

  /** A user with at least one row in every user-data table. */
  async function fullUser(keypair = Ed25519Keypair.generate()) {
    const client = api.client();
    const { address } = await signIn(client, keypair);
    await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });
    const amazon = (await client.get("/transactions")).body.transactions.find((t: { merchant: string }) => t.merchant === "Amazon");
    await client.patch(`/transactions/${amazon.id}`, { category: "business", remember: true });
    await client.put("/budgets/entertainment", { limit: 10 });
    await client.post("/goals", { name: "Laptop", target: 1200, due: "2027-01-31" });
    await client.put("/me/profile", { name: "Ada", onboarded: true, sources: { csv: true, sui: true } });
    await client.post("/memories", { kind: "goal", text: "Saving for a laptop by January." });
    const forgotten = (await client.post("/memories", { kind: "preference", text: "Bolt rides late at night are for safety." })).body.memory;
    await flushBackgroundWork();
    await client.delete(`/memories/${forgotten.id}`);
    await client.post("/ask", { question: "How is my laptop goal going?" });
    await client.get("/reminders");
    await client.post(`/recurring/${recurringId("netflix")}/pause`);
    await database.db.insert(budgetSuggestionDecisions).values({
      userAddress: address,
      suggestionId: "shopping:lower:90",
      category: "shopping",
      direction: "lower",
      fromLimit: "150.00",
      toLimit: "90.00",
      decision: "dismissed",
    });
    chain.transfer({ digest: `d-${address}`, from: `0x${"e".repeat(64)}`, to: address, usdc: 25, at: new Date().toISOString() });
    await client.post("/wallet/sync");
    await flushBackgroundWork();
    return { client, address, keypair, forgottenId: forgotten.id as string };
  }

  it("lists every table with user data, so a new one can't be left out of export and deletion", () => {
    const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
    const covered = new Set(Object.values(USER_DATA_TABLES).map((t) => t.table));
    for (const table of tables) {
      const name = getTableName(table);
      const hasOwner = Object.values(getTableColumns(table)).some((c) => c.name === "user_address");
      if (NOT_EXPORTED.has(name)) continue;
      assert.ok(hasOwner && covered.has(table), `table "${name}" holds user data but isn't in USER_DATA_TABLES`);
    }
    assert.equal(covered.size, Object.keys(USER_DATA_TABLES).length);
  });

  it("exports every row the user owns, forgotten memories included, as a download", async () => {
    const { client, address, forgottenId } = await fullUser();
    const other = await fullUser();

    const res = await client.get("/me/export");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") ?? "", /^attachment; filename="sovra-export-\d{4}-\d{2}-\d{2}\.json"$/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.body.format, "sovra-export");
    assert.equal(res.body.version, 1);

    assert.equal(res.body.account.address, address);
    assert.ok(!("passwordHash" in res.body.account), "the password hash is never exported");

    const counts = await countFor(address);
    assert.deepEqual(Object.keys(res.body.data).sort(), Object.keys(USER_DATA_TABLES).sort());
    for (const [name, rows] of Object.entries(res.body.data as Record<string, { userAddress: string }[]>)) {
      assert.ok(rows.length > 0, `${name} has rows for this user`);
      assert.equal(rows.length, counts[name], `${name}: every row exported`);
      assert.ok(rows.every((r) => r.userAddress === address), `${name}: only this user's rows`);
    }
    const memory = res.body.data.memories.find((m: { id: string }) => m.id === forgottenId);
    assert.ok(memory?.forgottenAt, "forgotten memories are included and flagged");
    assert.ok(!JSON.stringify(res.body).includes(other.address));
  });

  it("deletes everything the account owned, after explicit confirmation", async () => {
    const { client, address } = await fullUser();
    await client.post("/auth/nonce", { address });
    const before = await countFor(address);
    assert.ok(Object.values(before).every((n) => n > 0));
    const onWalrus = (await database.db.select().from(schema.memories).where(eq(schema.memories.userAddress, address))).filter((m) => m.blobId).length;
    assert.ok(onWalrus > 0);

    const missing = await client.request("DELETE", "/me", { json: {} });
    assert.equal(missing.status, 400);
    const wrong = await client.request("DELETE", "/me", { json: { confirm: `0x${"0".repeat(64)}` } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, "confirmation_mismatch");
    assert.equal((await database.db.select().from(users).where(eq(users.address, address))).length, 1, "nothing deleted yet");

    const res = await client.request("DELETE", "/me", { json: { confirm: address.toUpperCase().replace("0X", "0x") } });
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, true);
    assert.deepEqual(res.body.removed, before);
    assert.ok(
      res.body.retained[0].startsWith(`${onWalrus} memories were written to Walrus Memory. Their encrypted copies stay on Walrus until their storage period ends`),
      res.body.retained[0],
    );
    assert.ok(res.body.retained.some((r: string) => r.includes("Sui blockchain")));
    assert.match(res.headers.get("set-cookie") ?? "", /^sovra_session=;/);

    assert.ok(Object.values(await countFor(address)).every((n) => n === 0), "no user data left");
    assert.equal((await database.db.select().from(users).where(eq(users.address, address))).length, 0);
    assert.equal((await database.db.select().from(authNonces).where(eq(authNonces.address, address))).length, 0);
  });

  it("refuses old sessions afterwards on every route, and they can't re-create the account", async () => {
    const { client, address } = await fullUser();
    const otherDevice = api.client();
    otherDevice.cookie = client.cookie;
    await client.request("DELETE", "/me", { json: { confirm: address } });

    const routes: [string, string, unknown?][] = [
      ["GET", "/me"],
      ["PUT", "/me/profile", { name: "Back", onboarded: true, sources: { csv: true, sui: true } }],
      ["GET", "/me/export"],
      ["PUT", "/budgets/food", { limit: 100 }],
      ["POST", "/goals", { name: "Again", target: 10, due: "2027-01-01" }],
      ["POST", "/memories", { kind: "goal", text: "Should not be saved." }],
      ["GET", "/transactions"],
      ["GET", "/accounts"],
      ["POST", "/wallet/sync"],
      ["GET", "/recurring"],
      ["GET", "/reminders"],
      ["GET", "/budgets/suggestions"],
      ["POST", "/ask", { question: "Am I still here?" }],
      ["GET", "/ask/history"],
      ["DELETE", "/me", { confirm: address }],
    ];
    for (const [method, path, json] of routes) {
      const res = await otherDevice.request(method, path, json === undefined ? {} : { json });
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.match(res.body.error.message, /no longer exists/);
    }
    const imported = await otherDevice.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });
    assert.equal(imported.status, 401);
    assert.equal((await database.db.select().from(users).where(eq(users.address, address))).length, 0, "the account stays deleted");
    assert.ok(Object.values(await countFor(address)).every((n) => n === 0));
  });

  it("never recalls the deleted account's Walrus memories, even after signing in again", async () => {
    const { client, address, keypair } = await fullUser();
    const walrusCopies = memwal.stored.filter((m) => m.namespace.endsWith(address.toLowerCase())).length;
    assert.ok(walrusCopies > 0, "the old memories are still on (fake) Walrus");
    await client.request("DELETE", "/me", { json: { confirm: address } });

    const again = api.client();
    await signIn(again, keypair);
    assert.deepEqual((await again.get("/memories")).body.memories, []);
    assert.deepEqual((await again.post("/memories/recall", { query: "laptop safety January" })).body.results, []);
    const asked = await again.post("/ask", { question: "What did I tell you about my laptop?" });
    assert.deepEqual(asked.body.usedMemories, []);
    assert.deepEqual((await again.get("/transactions")).body.transactions, [], "a fresh, empty account");
  });

  it("deletes email and demo accounts too", async () => {
    const email = `delete-${Date.now()}@example.com`;
    const emailClient = api.client();
    const signup = await emailClient.post("/auth/signup", { email, password: "long enough password" });
    assert.equal(signup.status, 201);
    const emailAddress = signup.body.user.address as string;
    assert.equal((await emailClient.request("DELETE", "/me", { json: { confirm: emailAddress } })).status, 200);
    assert.equal((await api.client().post("/auth/login", { email, password: "long enough password" })).status, 401);

    const demo = api.client();
    const demoAddress = (await demo.post("/auth/demo")).body.user.address as string;
    const res = await demo.request("DELETE", "/me", { json: { confirm: demoAddress } });
    assert.equal(res.status, 200);
    assert.ok(!res.body.retained.some((r: string) => r.includes("Walrus")), "demo memories never reached Walrus");
    assert.equal((await demo.get("/me")).status, 401);
  });

  it("requires a session", async () => {
    const client = api.client();
    assert.equal((await client.get("/me/export")).status, 401);
    assert.equal((await client.request("DELETE", "/me", { json: { confirm: "x" } })).status, 401);
  });
});

describe("data export and deletion without a database", () => {
  it("answer 503", async () => {
    const api = await createTestApp();
    try {
      const client: TestClient = api.client();
      const { address } = await signIn(client);
      assert.equal((await client.get("/me/export")).status, 503);
      assert.equal((await client.request("DELETE", "/me", { json: { confirm: address } })).status, 503);
    } finally {
      await api.close();
    }
  });
});

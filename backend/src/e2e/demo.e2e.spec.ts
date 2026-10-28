import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { JwtService } from "@nestjs/jwt";
import { eq, sql } from "drizzle-orm";
import { DemoService } from "../auth/demo.service.js";
import { accounts, budgets, categoryRules, goals, memories, profiles, transactions, users } from "../database/schema.js";
import {
  FakeAi,
  FakeMemWal,
  TEST_SESSION_SECRET,
  createTestApp,
  csvForm,
  flushBackgroundWork,
  signIn,
  type TestApp,
} from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("demo accounts", () => {
  let database: TestDatabase;
  let api: TestApp;
  let memwal: FakeMemWal;
  let ai: FakeAi;

  before(async () => {
    database = await createTestDatabase();
    memwal = new FakeMemWal();
    ai = new FakeAi(true, { shoprite: "food" });
    api = await createTestApp({ database, memwal, ai });
  });

  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  async function startDemo() {
    const client = api.client();
    const res = await client.post("/auth/demo");
    assert.equal(res.status, 200);
    return { client, address: res.body.user.address as string };
  }

  const countRows = async (address: string) => ({
    profiles: (await database.db.select().from(profiles).where(eq(profiles.userAddress, address))).length,
    accounts: (await database.db.select().from(accounts).where(eq(accounts.userAddress, address))).length,
    transactions: (await database.db.select().from(transactions).where(eq(transactions.userAddress, address))).length,
    rules: (await database.db.select().from(categoryRules).where(eq(categoryRules.userAddress, address))).length,
    budgets: (await database.db.select().from(budgets).where(eq(budgets.userAddress, address))).length,
    goals: (await database.db.select().from(goals).where(eq(goals.userAddress, address))).length,
    memories: (await database.db.select().from(memories).where(eq(memories.userAddress, address))).length,
  });

  it("gives every visitor a fresh account seeded with the sample data", async () => {
    const { client, address } = await startDemo();
    assert.deepEqual(await countRows(address), {
      profiles: 1,
      accounts: 2,
      transactions: 48,
      rules: 2,
      budgets: 6,
      goals: 2,
      memories: 7,
    });

    const me = (await client.get("/me")).body;
    assert.equal(me.user.method, "demo");
    assert.equal(me.profile.name, "Ada");
    assert.equal(me.profile.onboarded, true);
    assert.deepEqual(me.profile.limit, { category: "entertainment", amount: 100 });

    // Recurring detection finds the subscriptions, with Netflix and Spotify renewing in three days.
    const recurring = (await client.get("/recurring")).body.recurring as { merchant: string; nextDate: string; cadence: string }[];
    const netflix = recurring.find((r) => r.merchant === "Netflix");
    assert.equal(netflix?.cadence, "monthly");
    assert.equal(netflix?.nextDate, daysAhead(3));
    assert.ok(recurring.some((r) => r.merchant === "Spotify"));
    assert.ok(recurring.some((r) => r.merchant === "Tunde Bakare"));
    assert.ok(!recurring.some((r) => r.merchant === "Disney+"), "Disney+ was paused, so it isn't a live renewal");

    // Learned rules and the memories behind them are linked.
    const amazon = (await client.get("/transactions?limit=500")).body.transactions.find((t: { merchant: string }) => t.merchant === "Amazon");
    assert.equal(amazon.category, "business");
    assert.ok(amazon.learnedFrom);

    const mems = (await client.get("/memories")).body.memories as { status: string; kind: string }[];
    assert.equal(mems.length, 7);
    assert.ok(mems.every((m) => m.status === "local"));
    assert.equal((await client.get("/goals")).body.goals[0].name, "Laptop fund");
  });

  it("keeps demo sessions apart", async () => {
    const a = await startDemo();
    const b = await startDemo();
    assert.notEqual(a.address, b.address);

    const goalOfA = (await a.client.get("/goals")).body.goals[0];
    assert.equal((await a.client.patch(`/goals/${goalOfA.id}`, { saved: 1199 })).status, 200);
    await a.client.put("/budgets/food", { limit: 999 });
    await a.client.post("/memories", { kind: "preference", text: "Only visible to demo A." });
    await a.client.request("POST", "/transactions/import", { form: csvForm("Date,Description,Amount\n2026-10-01,Only A,-1") });

    // B sees its own untouched sample data.
    assert.equal((await b.client.get("/goals")).body.goals[0].saved, 740);
    assert.equal((await b.client.get("/budgets")).body.budgets.find((x: { category: string }) => x.category === "food").limit, 320);
    assert.equal((await b.client.get("/memories")).body.memories.length, 7);
    assert.equal((await b.client.get("/transactions?limit=500")).body.transactions.length, 48);

    // And can't reach A's rows by id.
    assert.equal((await b.client.patch(`/goals/${goalOfA.id}`, { saved: 0 })).status, 404);
    assert.equal((await b.client.delete(`/goals/${goalOfA.id}`)).status, 404);
    const memoryOfA = (await a.client.get("/memories")).body.memories[0];
    assert.equal((await b.client.delete(`/memories/${memoryOfA.id}`)).status, 404);
    assert.equal((await a.client.get("/goals")).body.goals[0].saved, 1199);
  });

  it("never calls Walrus for a demo account, while real accounts still use it", async () => {
    const { client } = await startDemo();
    const before = memwal.calls;

    assert.equal((await client.post("/memories", { kind: "goal", text: "Save for a bike by spring." })).body.memory.status, "local");
    const recalled = await client.post("/memories/recall", { query: "bike spring" });
    assert.equal(recalled.body.results[0].text, "Save for a bike by spring.");

    const tx = (await client.get("/transactions")).body.transactions.find((t: { merchant: string }) => t.merchant === "Shoprite");
    assert.equal((await client.patch(`/transactions/${tx.id}`, { category: "food", remember: true })).body.memory.status, "saved");
    const profile = (await client.get("/me")).body.profile;
    const saved = await client.put("/me/profile", { ...profile, limit: { category: "entertainment", amount: 90 } });
    assert.deepEqual(
      saved.body.memories.map((m: { status: string }) => m.status),
      ["saved"],
    );
    const asked = await client.post("/ask", { question: "Is my laptop goal on track?" });
    assert.equal(asked.status, 200);
    assert.ok(asked.body.usedMemories.length > 0, "Ask uses the demo's local memories");

    await flushBackgroundWork();
    assert.equal(memwal.calls, before, "no Walrus remember or recall for the demo");

    const real = api.client();
    await signIn(real);
    await real.post("/memories", { kind: "goal", text: "A real goal." });
    assert.equal(memwal.calls, before + 1);
  });

  it("categorizes demo imports with keywords only, never the AI model", async () => {
    const { client } = await startDemo();
    const before = ai.categorized.length;
    const res = await client.request("POST", "/transactions/import", {
      form: csvForm("Date,Description,Amount\n2026-10-01,Shoprite Lekki,-20\n2026-10-02,Mystery shop,-5"),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.categorizedBy.ai, 0);
    assert.equal(ai.categorized.length, before);
  });

  it("ends the session when the demo expires and cleans the account up", async () => {
    const expired = await startDemo();
    await database.db.update(users).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(users.address, expired.address));

    const res = await expired.client.get("/me");
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /demo has ended/);
    assert.equal((await expired.client.get("/transactions")).status, 401);

    // The next demo start removes expired accounts and every row they own.
    await startDemo();
    assert.equal((await database.db.select().from(users).where(eq(users.address, expired.address))).length, 0);
    assert.deepEqual(await countRows(expired.address), {
      profiles: 0,
      accounts: 0,
      transactions: 0,
      rules: 0,
      budgets: 0,
      goals: 0,
      memories: 0,
    });
  });

  it("cleanup only deletes expired demo accounts", async () => {
    const real = api.client();
    const { address: realAddress } = await signIn(real);
    const live = await startDemo();
    const legacy = `0x${"d".repeat(64)}`;
    await database.db.insert(users).values({ address: legacy, method: "demo", name: "Shared demo" });
    const old = await startDemo();
    await database.db.update(users).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(users.address, old.address));

    const cleaned = await api.app.get(DemoService).cleanupExpired();
    assert.ok(cleaned >= 1);
    const remaining = new Set((await database.db.select({ address: users.address }).from(users)).map((u) => u.address));
    assert.ok(!remaining.has(old.address));
    assert.ok(remaining.has(live.address));
    assert.ok(remaining.has(realAddress));
    assert.ok(remaining.has(legacy), "rows without an expiry are left for a person to remove");
  });

  it("rejects sessions for the old shared demo account and for demos that no longer exist", async () => {
    const jwt = new JwtService({ secret: TEST_SESSION_SECRET });
    const legacy = `0x${"e".repeat(64)}`;
    await database.db.insert(users).values({ address: legacy, method: "demo", name: "Shared demo" });

    for (const sub of [legacy, `0x${"f".repeat(64)}`]) {
      const client = api.client();
      client.cookie = `sovra_session=${await jwt.signAsync({ sub, method: "demo" }, { expiresIn: 3600 })}`;
      const res = await client.get("/me");
      assert.equal(res.status, 401, sub);
    }
  });

  it("keeps real accounts working whatever happens to demos", async () => {
    const client = api.client();
    await signIn(client);
    await database.db.execute(sql`update users set expires_at = now() - interval '1 day' where method = 'demo'`);
    await api.app.get(DemoService).cleanupExpired();
    assert.equal((await client.get("/me")).status, 200);
  });
});

describe("demo settings and limits", () => {
  it("lasts DEMO_TTL_HOURS and caps demo questions per IP, separately from real users", async () => {
    const database = await createTestDatabase();
    const api = await createTestApp({ database, ai: new FakeAi(), env: { DEMO_TTL_HOURS: "2", RATE_LIMIT_DEMO_ASK_PER_HOUR: "2" } });
    try {
      const sameIp = { "x-forwarded-for": "198.51.100.7" };
      const first = api.client(sameIp);
      const started = await first.post("/auth/demo");
      assert.match(started.headers.get("set-cookie") ?? "", /Max-Age=7200/);
      const [row] = await database.db.select().from(users).where(eq(users.address, started.body.user.address));
      const hours = (row.expiresAt!.getTime() - Date.now()) / 3_600_000;
      assert.ok(hours > 1.9 && hours <= 2, `expires in ${hours} hours`);

      assert.equal((await first.post("/ask", { question: "One" })).status, 200);
      assert.equal((await first.post("/ask", { question: "Two" })).status, 200);

      // A second demo from the same IP shares the per-IP demo allowance.
      const second = api.client(sameIp);
      await second.post("/auth/demo");
      const blocked = await second.post("/ask", { question: "Three" });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, "rate_limited");

      // A real user on the same IP is not affected.
      const real = api.client(sameIp);
      await signIn(real);
      assert.equal((await real.post("/ask", { question: "Mine" })).status, 200);
    } finally {
      await api.close();
      await database.close();
    }
  });

  it("still starts a demo session without a database", async () => {
    const api = await createTestApp();
    try {
      const client = api.client();
      const res = await client.post("/auth/demo");
      assert.equal(res.status, 200);
      assert.equal(res.body.user.method, "demo");
      assert.equal((await client.get("/me")).status, 200);
      assert.equal((await client.get("/goals")).status, 503);
    } finally {
      await api.close();
    }
  });
});

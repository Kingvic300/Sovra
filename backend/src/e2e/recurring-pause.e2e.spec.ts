import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { recurringStates } from "../database/schema.js";
import { recurringId } from "../recurring/recurring.module.js";
import { FakeAi, FakeMemWal, createTestApp, csvForm, flushBackgroundWork, signIn, type TestApp, type TestClient } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Netflix charged 89, 59 and 29 days ago, so its next charge is tomorrow. */
const NETFLIX = ["Date,Description,Amount", ...[89, 59, 29].map((n) => `${daysFromNow(-n)},Netflix,-17.99`)].join("\n");
const TOMORROW = daysFromNow(1);
/** The month tomorrow falls in: this month, or next month on the last day of a month. */
const RENEWAL_MONTH = TOMORROW.slice(0, 7);

describe("recurring charge pause and resume", () => {
  let database: TestDatabase;
  let api: TestApp;
  let memwal: FakeMemWal;
  let ai: FakeAi;

  before(async () => {
    database = await createTestDatabase();
    memwal = new FakeMemWal();
    ai = new FakeAi();
    api = await createTestApp({ database, memwal, ai });
  });

  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  async function userWithNetflix() {
    const client = api.client();
    const { address } = await signIn(client);
    await client.request("POST", "/transactions/import", { form: csvForm(NETFLIX) });
    await client.put("/budgets/entertainment", { limit: 100 });
    const [netflix] = (await client.get("/recurring")).body.recurring;
    return { client, address, netflix };
  }

  const entertainment = async (client: TestClient) =>
    (await client.get(`/budgets?month=${RENEWAL_MONTH}`)).body.budgets.find((b: { category: string }) => b.category === "entertainment");

  it("lists recurring charges with a stable id and their status", async () => {
    const { netflix } = await userWithNetflix();
    assert.equal(netflix.id, recurringId("netflix"));
    assert.equal(netflix.status, "active");
    assert.equal(netflix.pausedAt, null);
    assert.equal(netflix.nextDate, TOMORROW);
    assert.equal(netflix.amount, 17.99);
  });

  it("projects active renewals into the budget and frees the money when paused", async () => {
    const { client, netflix } = await userWithNetflix();
    const before = await entertainment(client);
    assert.equal(before.committed, 17.99);
    assert.equal(before.projected, Math.round((before.spent + 17.99) * 100) / 100);
    assert.deepEqual(before.renewals, [{ id: netflix.id, merchant: "Netflix", amount: 17.99, date: TOMORROW }]);

    const paused = await client.post(`/recurring/${netflix.id}/pause`);
    assert.equal(paused.status, 200);
    assert.equal(paused.body.changed, true);
    assert.equal(paused.body.recurring.status, "paused");
    assert.ok(!Number.isNaN(Date.parse(paused.body.recurring.pausedAt)));
    assert.match(paused.body.note, /only stops Sovra counting.*cancel or pause it with Netflix/);

    const during = await entertainment(client);
    assert.equal(during.committed, 0);
    assert.equal(during.projected, before.spent);
    assert.deepEqual(during.renewals, []);
    assert.equal(during.spent, before.spent, "pausing never changes what was actually spent");

    const resumed = await client.post(`/recurring/${netflix.id}/resume`);
    assert.equal(resumed.body.recurring.status, "active");
    assert.equal(resumed.body.recurring.pausedAt, null);
    assert.deepEqual(await entertainment(client), before);
  });

  it("commits renewals in the user's currency, converted like the spending they sit next to", async () => {
    const client = api.client();
    await signIn(client);
    await client.put("/me/profile", { name: "Ada", onboarded: true, sources: { csv: true, sui: false }, currency: "NGN" });
    // A USD card statement for someone who budgets in naira (the fake rate is 1 USD = 1500 NGN).
    await client.request("POST", "/transactions/import", { form: csvForm(NETFLIX, "card.csv", { currency: "USD" }) });
    await client.put("/budgets/entertainment", { limit: 30000 });

    const [netflix] = (await client.get("/recurring")).body.recurring;
    assert.equal(netflix.currency, "NGN");
    assert.equal(netflix.amount, 26985);
    const budget = await entertainment(client);
    assert.equal(budget.committed, 26985);
    assert.equal(budget.projected, Math.round((budget.spent + 26985) * 100) / 100);

    await client.post(`/recurring/${netflix.id}/pause`);
    assert.equal((await entertainment(client)).committed, 0);
  });

  it("keeps the paused state across reloads and new imports", async () => {
    const { client, address, netflix } = await userWithNetflix();
    await client.post(`/recurring/${netflix.id}/pause`);
    await client.request("POST", "/transactions/import", { form: csvForm(`Date,Description,Amount\n${daysFromNow(-2)},Shoprite,-20`) });

    const relisted = (await client.get("/recurring")).body.recurring.find((r: { id: string }) => r.id === netflix.id);
    assert.equal(relisted.status, "paused");
    const [row] = await database.db.select().from(recurringStates).where(eq(recurringStates.userAddress, address));
    assert.equal(row.status, "paused");
  });

  it("does nothing the second time and remembers each decision once", async () => {
    const { client, address, netflix } = await userWithNetflix();
    const first = await client.post(`/recurring/${netflix.id}/pause`);
    assert.equal(first.body.memory.status, "saved");
    assert.match(first.body.memory.text, /^You paused Netflix in Sovra on \d+ \w{3}, so it no longer counts against your entertainment budget\.$/);

    const again = await client.post(`/recurring/${netflix.id}/pause`);
    assert.equal(again.status, 200);
    assert.equal(again.body.changed, false);
    assert.equal(again.body.memory, null);
    await flushBackgroundWork();
    const decisions = (await client.get("/memories?kind=decision")).body.memories;
    assert.equal(decisions.length, 1);
    assert.equal((await database.db.select().from(recurringStates).where(eq(recurringStates.userAddress, address))).length, 1);
  });

  it("still pauses when Walrus Memory fails", async () => {
    const { client, netflix } = await userWithNetflix();
    memwal.failing = true;
    try {
      const res = await client.post(`/recurring/${netflix.id}/pause`);
      assert.equal(res.status, 200);
      assert.equal(res.body.recurring.status, "paused");
      assert.equal(res.body.memory.status, "failed");
    } finally {
      memwal.failing = false;
    }
    assert.equal((await entertainment(client)).committed, 0);
  });

  it("leaves paused charges out of Ask's upcoming bills", async () => {
    const { client, netflix } = await userWithNetflix();
    await client.post("/ask", { question: "What renews soon?" });
    const before = (ai.answers.at(-1)!.context.upcomingBills ?? []) as { merchant: string }[];
    assert.ok(before.some((b) => b.merchant === "Netflix"));

    await client.post(`/recurring/${netflix.id}/pause`);
    await client.post("/ask", { question: "What renews soon now?" });
    const after = (ai.answers.at(-1)!.context.upcomingBills ?? []) as { merchant: string }[];
    assert.ok(!after.some((b) => b.merchant === "Netflix"));
  });

  it("answers 404 for charges that aren't the user's or aren't recurring", async () => {
    const owner = await userWithNetflix();
    const other = api.client();
    await signIn(other);

    assert.equal((await other.post(`/recurring/${owner.netflix.id}/pause`)).status, 404, "another user's charge");
    assert.equal((await owner.client.get("/recurring")).body.recurring[0].status, "active", "and it stays untouched");
    assert.equal((await owner.client.post(`/recurring/${recurringId("not a subscription")}/pause`)).status, 404);
    assert.equal((await owner.client.post("/recurring/bad%2Fid/pause")).status, 400);
  });

  it("works on demo accounts, keeping the decision local", async () => {
    const client = api.client();
    await client.post("/auth/demo");
    const netflix = (await client.get("/recurring")).body.recurring.find((r: { merchant: string }) => r.merchant === "Netflix");
    const calls = memwal.calls;
    const res = await client.post(`/recurring/${netflix.id}/pause`);
    assert.equal(res.body.recurring.status, "paused");
    assert.equal(res.body.memory.status, "saved");
    assert.equal(memwal.calls, calls, "demo decisions never reach Walrus");
  });

  it("requires a session", async () => {
    const client = api.client();
    assert.equal((await client.post(`/recurring/${recurringId("netflix")}/pause`)).status, 401);
    assert.equal((await client.post(`/recurring/${recurringId("netflix")}/resume`)).status, 401);
  });
});

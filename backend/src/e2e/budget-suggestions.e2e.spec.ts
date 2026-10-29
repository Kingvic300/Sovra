import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { lastFullMonths } from "../budgets/budget-suggestions.js";
import { budgetSuggestionDecisions } from "../database/schema.js";
import { FakeMemWal, createTestApp, csvForm, flushBackgroundWork, signIn, type TestApp, type TestClient } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const MONTHS = lastFullMonths(new Date());
const TODAY = new Date().toISOString().slice(0, 10);

/** Three full months: transport over its $150 limit twice, shopping well under its $150 limit. */
const HISTORY = [
  "Date,Description,Amount",
  `${MONTHS[0]}-01,Shoprite,-1`,
  ...[160, 175, 125].map((spent, i) => `${MONTHS[i]}-10,Bolt,-${spent}`),
  ...[64, 50, 70].map((spent, i) => `${MONTHS[i]}-12,Jumia,-${spent}`),
].join("\n");

describe("budget suggestions", () => {
  let database: TestDatabase;
  let api: TestApp;

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database, memwal: new FakeMemWal() });
  });

  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  async function userWithHistory(csv = HISTORY) {
    const client = api.client();
    const { address } = await signIn(client);
    await client.request("POST", "/transactions/import", { form: csvForm(csv) });
    await client.put("/budgets/transport", { limit: 150 });
    await client.put("/budgets/shopping", { limit: 150 });
    return { client, address };
  }

  const suggestionsOf = async (client: TestClient) => (await client.get("/budgets/suggestions")).body.suggestions as { id: string; to: number; text: string; evidence: unknown[] }[];

  it("suggests changes from the user's last three full months, the same way every time", async () => {
    const { client } = await userWithHistory();
    const first = await suggestionsOf(client);
    assert.deepEqual(
      first.map((s) => s.id),
      ["transport:raise:160", "shopping:lower:90"],
    );
    assert.deepEqual(first[0].evidence, [
      { month: MONTHS[0], spent: 160 },
      { month: MONTHS[1], spent: 175 },
      { month: MONTHS[2], spent: 125 },
    ]);
    assert.deepEqual(await suggestionsOf(client), first);
  });

  it("suggests nothing without three full months of history", async () => {
    // Two quiet months of shopping would look like a "lower" case if the missing month counted as $0.
    const short = ["Date,Description,Amount", ...[50, 60].map((spent, i) => `${MONTHS[i + 1]}-12,Jumia,-${spent}`)].join("\n");
    const { client } = await userWithHistory(short);
    assert.deepEqual(await suggestionsOf(client), []);
  });

  it("accepting sets the new limit, remembers it, and can't be repeated", async () => {
    const { client, address } = await userWithHistory();
    const res = await client.post("/budgets/suggestions/transport:raise:160/accept");
    assert.equal(res.status, 200);
    assert.equal(res.body.decision, "accepted");
    assert.deepEqual(res.body.budget, { category: "transport", limit: 160 });
    assert.equal(res.body.memory.status, "saved");
    assert.equal(res.body.memory.text, "You raised your transport limit from $150 to $160 a month after a Sovra suggestion.");

    const transport = (await client.get("/budgets")).body.budgets.find((b: { category: string }) => b.category === "transport");
    assert.equal(transport.limit, 160);
    assert.ok(!(await suggestionsOf(client)).some((s) => s.id.startsWith("transport:")));

    const again = await client.post("/budgets/suggestions/transport:raise:160/accept");
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, "already_decided");
    assert.equal(
      (await database.db.select().from(budgetSuggestionDecisions).where(eq(budgetSuggestionDecisions.userAddress, address))).length,
      1,
    );
  });

  it("dismissing keeps the limit and hides that kind of suggestion for 90 days", async () => {
    const { client, address } = await userWithHistory();
    const res = await client.post("/budgets/suggestions/shopping:lower:90/dismiss");
    assert.equal(res.status, 200);
    assert.equal(res.body.budget, null);
    assert.equal(res.body.memory.text, "You kept your shopping limit at $150, so Sovra won't suggest lowering it for 3 months.");
    const shopping = (await client.get("/budgets")).body.budgets.find((b: { category: string }) => b.category === "shopping");
    assert.equal(shopping.limit, 150);

    // A different limit would give a different target, but the same kind of suggestion stays hidden.
    await client.put("/budgets/shopping", { limit: 200 });
    assert.ok(!(await suggestionsOf(client)).some((s) => s.id.startsWith("shopping:lower")));
    assert.equal((await client.post("/budgets/suggestions/shopping:lower:90/dismiss")).status, 409);

    // After the window it can come back.
    await database.db
      .update(budgetSuggestionDecisions)
      .set({ decidedAt: new Date(Date.now() - 91 * 86_400_000) })
      .where(and(eq(budgetSuggestionDecisions.userAddress, address), eq(budgetSuggestionDecisions.suggestionId, "shopping:lower:90")));
    assert.ok((await suggestionsOf(client)).some((s) => s.id === "shopping:lower:90"));
  });

  it("won't suggest a lower limit this month's spending would already break", async () => {
    const { client } = await userWithHistory(`${HISTORY}\n${TODAY},Jumia,-95`);
    assert.ok(!(await suggestionsOf(client)).some((s) => s.id.startsWith("shopping:")));
  });

  it("only acts on suggestions the user is being offered", async () => {
    const owner = await userWithHistory();
    const other = api.client();
    await signIn(other);
    await other.put("/budgets/transport", { limit: 150 });

    assert.equal((await other.post("/budgets/suggestions/transport:raise:160/accept")).status, 404);
    assert.equal((await owner.client.post("/budgets/suggestions/transport:raise:999/accept")).status, 404);
    assert.equal((await owner.client.post("/budgets/suggestions/nonsense/accept")).status, 400);
    const ownerTransport = (await owner.client.get("/budgets")).body.budgets.find((b: { category: string }) => b.category === "transport");
    assert.equal(ownerTransport.limit, 150);
    assert.equal((await other.get("/budgets")).body.budgets[0].limit, 150);
  });

  it("requires a session", async () => {
    const client = api.client();
    assert.equal((await client.get("/budgets/suggestions")).status, 401);
    assert.equal((await client.post("/budgets/suggestions/transport:raise:160/accept")).status, 401);
    assert.equal((await client.post("/budgets/suggestions/transport:raise:160/dismiss")).status, 401);
  });
});

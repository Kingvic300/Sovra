import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { accounts, budgets, categoryRules, goals } from "../database/schema.js";
import { FakeAi, createTestApp, csvForm, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const STATEMENT = [
  "Date,Description,Amount",
  "2026-09-03,NETFLIX.COM,-17.99",
  "2026-09-05,Mystery Co,-40.00",
  "2026-09-10,Salary ACME,1800.00",
  "2026-09-12,AMAZON MKTPLACE 1234,-30.00",
  "2026-09-20,AMAZON MKTPLACE 9876,-12.50",
  "not a date,Broken row,-1",
].join("\n");

describe("user data routes", () => {
  let database: TestDatabase;
  let api: TestApp;
  let ai: FakeAi;

  before(async () => {
    database = await createTestDatabase();
    ai = new FakeAi(true, { "mystery co": "business" });
    api = await createTestApp({ database, ai });
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

  describe("profile", () => {
    const profile = {
      name: "Ada",
      onboarded: true,
      goal: { name: "Laptop", target: 1200, due: "2027-01-31" },
      limit: { category: "entertainment", amount: 100 },
      payday: 25,
      sources: { csv: true, sui: true },
    };

    it("saves onboarding answers and turns the goal and limit into rows", async () => {
      const { client, address } = await newUser();
      const res = await client.put("/me/profile", profile);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.profile, profile);
      // Walrus Memory isn't configured, so memories are reported as skipped rather than failing the save.
      assert.deepEqual(
        res.body.memories.map((m: { kind: string; status: string }) => [m.kind, m.status]),
        [
          ["goal", "skipped"],
          ["limit", "skipped"],
          ["preference", "skipped"],
        ],
      );

      const me = await client.get("/me");
      assert.deepEqual(me.body.profile, profile);
      assert.equal((await database.db.select().from(goals).where(eq(goals.userAddress, address))).length, 1);
      const [budget] = await database.db.select().from(budgets).where(eq(budgets.userAddress, address));
      assert.deepEqual({ category: budget.category, limit: budget.limit }, { category: "entertainment", limit: "100.00" });
    });

    it("does not duplicate the goal when the same profile is saved again", async () => {
      const { client, address } = await newUser();
      await client.put("/me/profile", profile);
      const again = await client.put("/me/profile", profile);
      assert.deepEqual(again.body.memories, []);
      assert.equal((await database.db.select().from(goals).where(eq(goals.userAddress, address))).length, 1);
    });

    it("still notices when the goal or limit really changes", async () => {
      const { client, address } = await newUser();
      await client.put("/me/profile", profile);
      const changed = await client.put("/me/profile", { ...profile, goal: { ...profile.goal, target: 1500 }, limit: { category: "entertainment", amount: 80 } });
      assert.deepEqual(
        changed.body.memories.map((m: { kind: string }) => m.kind),
        ["goal", "limit"],
      );
      assert.equal((await database.db.select().from(goals).where(eq(goals.userAddress, address))).length, 2);
      const [budget] = await database.db.select().from(budgets).where(eq(budgets.userAddress, address));
      assert.equal(budget.limit, "80.00");
    });

    it("validates the profile", async () => {
      const { client } = await newUser();
      const res = await client.put("/me/profile", { ...profile, payday: 40 });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /payday/);
    });
  });

  describe("transactions", () => {
    it("previews a statement without saving anything", async () => {
      const { client, address } = await newUser();
      const res = await client.request("POST", "/transactions/import?preview=1", { form: csvForm(STATEMENT) });
      assert.equal(res.status, 201);
      assert.equal(res.body.preview, true);
      assert.equal(res.body.total, 5);
      assert.deepEqual(res.body.skipped, [{ line: 7, reason: "Unreadable date" }]);
      assert.equal(res.body.rows[0].raw, undefined, "preview rows don't echo raw CSV");
      assert.equal((await client.get("/transactions")).body.transactions.length, 0);
      assert.equal((await database.db.select().from(accounts).where(eq(accounts.userAddress, address))).length, 0);
    });

    it("imports a statement into a new account, using AI for merchants without a rule", async () => {
      const { client } = await newUser();
      const calls = ai.categorized.length;
      const res = await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT, "everyday.csv", { accountName: "Everyday" }) });
      assert.equal(res.status, 201);
      assert.equal(res.body.imported, 5);
      assert.equal(res.body.account.name, "Everyday");
      assert.equal(res.body.account.kind, "csv");
      assert.deepEqual(res.body.categorizedBy, { rules: 0, ai: 1, keywords: 4 });
      // One AI call, with each merchant key once.
      assert.equal(ai.categorized.length, calls + 1);
      assert.equal(ai.categorized.at(-1)!.length, 4);

      const list = await client.get("/transactions?month=2026-09");
      assert.deepEqual(
        list.body.transactions.map((t: { merchant: string; category: string; amount: number }) => [t.merchant, t.category, t.amount]),
        [
          ["AMAZON MKTPLACE 9876", "shopping", -12.5],
          ["AMAZON MKTPLACE 1234", "shopping", -30],
          ["Salary ACME", "income", 1800],
          ["Mystery Co", "business", -40],
          ["NETFLIX.COM", "entertainment", -17.99],
        ],
      );
      assert.equal((await client.get("/transactions?category=income")).body.transactions.length, 1);
      assert.equal((await client.get("/transactions?month=2026-08")).body.transactions.length, 0);
      assert.equal((await client.get("/transactions?limit=2")).body.transactions.length, 2);
    });

    it("names the account after the file when no name is given", async () => {
      const { client } = await newUser();
      const res = await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT, "October Statement.CSV") });
      assert.equal(res.body.account.name, "October Statement");
    });

    it("learns a category rule, recategorizes the merchant and applies it to later imports", async () => {
      const { client, address } = await newUser();
      await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });
      const amazon = (await client.get("/transactions")).body.transactions.find((t: { merchant: string }) => t.merchant === "AMAZON MKTPLACE 1234");

      const res = await client.patch(`/transactions/${amazon.id}`, { category: "business", remember: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.transaction.category, "business");
      assert.equal(res.body.recategorized, 1);
      assert.deepEqual(res.body.memory, {
        status: "skipped",
        text: "AMAZON MKTPLACE 1234 transactions are business supplies.",
        reason: "not_configured",
      });
      const [rule] = await database.db.select().from(categoryRules).where(eq(categoryRules.userAddress, address));
      assert.deepEqual({ merchantKey: rule.merchantKey, category: rule.category }, { merchantKey: "amazon", category: "business" });

      const next = await client.request("POST", "/transactions/import", {
        form: csvForm(["Date,Description,Amount", "2026-10-02,AMAZON MKTPLACE 5555,-20"].join("\n")),
      });
      assert.equal(next.body.learnedApplied, 1);
      const october = (await client.get("/transactions?month=2026-10")).body.transactions;
      assert.equal(october[0].category, "business");
    });

    it("changes one transaction without learning when remember is false", async () => {
      const { client, address } = await newUser();
      await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });
      const amazon = (await client.get("/transactions")).body.transactions.find((t: { merchant: string }) => t.merchant === "AMAZON MKTPLACE 1234");
      const res = await client.patch(`/transactions/${amazon.id}`, { category: "business", remember: false });
      assert.equal(res.body.recategorized, 0);
      assert.equal(res.body.memory, null);
      assert.equal((await database.db.select().from(categoryRules).where(eq(categoryRules.userAddress, address))).length, 0);
    });

    it("rejects missing, non-CSV and unreadable files", async () => {
      const { client } = await newUser();
      const missing = await client.request("POST", "/transactions/import", { form: new FormData() });
      assert.equal(missing.body.error.code, "file_missing");

      const form = new FormData();
      form.append("file", new Blob(["%PDF"], { type: "application/pdf" }), "statement.pdf");
      assert.equal((await client.request("POST", "/transactions/import", { form })).body.error.code, "unsupported_file");

      const noColumns = await client.request("POST", "/transactions/import", { form: csvForm("Foo,Bar\n1,2") });
      assert.equal(noColumns.status, 400);
      assert.equal(noColumns.body.error.code, "csv_columns_not_found");
    });

    it("validates the category", async () => {
      const { client } = await newUser();
      const res = await client.patch("/transactions/00000000-0000-0000-0000-000000000000", { category: "yachts" });
      assert.equal(res.status, 400);
    });
  });

  describe("budgets", () => {
    it("sets limits and reports spending for the month", async () => {
      const { client } = await newUser();
      await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });

      const set = await client.put("/budgets/entertainment", { limit: 100 });
      assert.deepEqual(set.body, { category: "entertainment", limit: 100 });
      await client.put("/budgets/shopping", { limit: 150 });
      await client.put("/budgets/shopping", { limit: 120 });

      const res = await client.get("/budgets?month=2026-09");
      assert.equal(res.body.month, "2026-09");
      const byCategory = Object.fromEntries(res.body.budgets.map((b: { category: string }) => [b.category, b]));
      assert.deepEqual(byCategory.entertainment, { category: "entertainment", label: "Entertainment", limit: 100, spent: 17.99 });
      assert.deepEqual(byCategory.shopping, { category: "shopping", label: "Shopping", limit: 120, spent: 42.5 });

      const otherMonth = await client.get("/budgets?month=2026-10");
      assert.equal(otherMonth.body.budgets.find((b: { category: string }) => b.category === "shopping").spent, 0);
    });

    it("deletes a limit and returns 404 when there is none", async () => {
      const { client } = await newUser();
      await client.put("/budgets/food", { limit: 300 });
      assert.deepEqual((await client.delete("/budgets/food")).body, { category: "food", deleted: true });
      assert.equal((await client.delete("/budgets/food")).status, 404);
    });

    it("validates category, limit and month", async () => {
      const { client } = await newUser();
      assert.equal((await client.put("/budgets/yachts", { limit: 10 })).status, 400);
      assert.equal((await client.put("/budgets/food", { limit: -5 })).status, 400);
      assert.equal((await client.get("/budgets?month=2026-9")).status, 400);
    });
  });

  describe("goals", () => {
    it("creates, lists, updates and deletes goals", async () => {
      const { client } = await newUser();
      const created = await client.post("/goals", { name: "Laptop", target: 1200, due: "2027-01-31", weekly: 40 });
      assert.equal(created.status, 201);
      assert.deepEqual({ ...created.body, id: undefined }, { id: undefined, name: "Laptop", target: 1200, saved: 0, due: "2027-01-31", weekly: 40 });
      await client.post("/goals", { name: "Cushion", target: 2000, due: "2026-12-31" });

      const list = await client.get("/goals");
      assert.deepEqual(
        list.body.goals.map((g: { name: string }) => g.name),
        ["Cushion", "Laptop"],
        "sorted by due date",
      );

      const updated = await client.patch(`/goals/${created.body.id}`, { saved: 740, weekly: null });
      assert.equal(updated.body.saved, 740);
      assert.equal(updated.body.weekly, null);
      assert.equal((await client.patch(`/goals/${created.body.id}`, {})).body.saved, 740);
      const renamed = await client.patch(`/goals/${created.body.id}`, { name: "New laptop" });
      assert.deepEqual([renamed.body.name, renamed.body.saved], ["New laptop", 740], "a partial update keeps the saved amount");

      assert.deepEqual((await client.delete(`/goals/${created.body.id}`)).body, { id: created.body.id, deleted: true });
      assert.equal((await client.get("/goals")).body.goals.length, 1);
    });

    it("validates goals and ids", async () => {
      const { client } = await newUser();
      assert.equal((await client.post("/goals", { name: "", target: 0, due: "soon" })).status, 400);
      assert.equal((await client.patch("/goals/not-a-uuid", { saved: 1 })).status, 400);
      assert.equal((await client.delete("/goals/00000000-0000-0000-0000-000000000000")).status, 404);
    });
  });

  describe("recurring", () => {
    it("finds monthly charges in recent transactions", async () => {
      const { client } = await newUser();
      const statement = [
        "Date,Description,Amount",
        `${daysAgo(65)},Spotify,-10.99`,
        `${daysAgo(34)},Spotify,-10.99`,
        `${daysAgo(3)},Spotify,-10.99`,
        `${daysAgo(20)},One-off shop,-80`,
      ].join("\n");
      await client.request("POST", "/transactions/import", { form: csvForm(statement) });

      const res = await client.get("/recurring");
      assert.equal(res.status, 200);
      assert.equal(res.body.recurring.length, 1);
      assert.equal(res.body.recurring[0].merchant, "Spotify");
      assert.equal(res.body.recurring[0].cadence, "monthly");
      assert.equal(res.body.recurring[0].lastDate, daysAgo(3));
    });

    it("ignores charges older than the 120-day window", async () => {
      const { client } = await newUser();
      const statement = ["Date,Description,Amount", `${daysAgo(190)},Old gym,-30`, `${daysAgo(160)},Old gym,-30`, `${daysAgo(130)},Old gym,-30`].join(
        "\n",
      );
      await client.request("POST", "/transactions/import", { form: csvForm(statement) });
      assert.deepEqual((await client.get("/recurring")).body.recurring, []);
    });
  });

  describe("ownership", () => {
    it("never shows or changes another user's data", async () => {
      const owner = await newUser();
      const other = await newUser();

      await owner.client.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });
      await owner.client.put("/budgets/food", { limit: 300 });
      const goal = (await owner.client.post("/goals", { name: "Laptop", target: 1200, due: "2027-01-31" })).body;
      const tx = (await owner.client.get("/transactions")).body.transactions[0];

      assert.deepEqual((await other.client.get("/transactions")).body.transactions, []);
      assert.deepEqual((await other.client.get("/budgets")).body.budgets, []);
      assert.deepEqual((await other.client.get("/goals")).body.goals, []);
      assert.deepEqual((await other.client.get("/recurring")).body.recurring, []);

      assert.equal((await other.client.patch(`/transactions/${tx.id}`, { category: "food", remember: true })).status, 404);
      assert.equal((await other.client.patch(`/goals/${goal.id}`, { saved: 1 })).status, 404);
      assert.equal((await other.client.delete(`/goals/${goal.id}`)).status, 404);
      assert.equal((await other.client.delete("/budgets/food")).status, 404);

      // The owner's data is untouched.
      assert.equal((await owner.client.get("/goals")).body.goals[0].saved, 0);
      assert.equal((await owner.client.get("/budgets")).body.budgets.length, 1);
      const ownerTx = (await owner.client.get("/transactions")).body.transactions.find((t: { id: string }) => t.id === tx.id);
      assert.equal(ownerTx.category, tx.category);
      assert.equal((await database.db.select().from(categoryRules).where(eq(categoryRules.userAddress, other.address))).length, 0);
    });
  });
});


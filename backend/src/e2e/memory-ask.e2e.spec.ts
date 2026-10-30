import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { memories } from "../database/schema.js";
import { namespaceFor } from "../memory/memwal.service.js";
import { FakeAi, FakeMemWal, createTestApp, csvForm, flushBackgroundWork, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

describe("memories and Ask Sovra", () => {
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

  async function newUser() {
    const client = api.client();
    const { address } = await signIn(client);
    return { client, address };
  }

  it("remembers into the user's own namespace with the kind tag and indexes it locally", async () => {
    const { client, address } = await newUser();
    const res = await client.post("/memories", { kind: "goal", text: "Saving for a laptop, $1,200 by January." });
    assert.equal(res.status, 201);
    assert.equal(res.body.memory.kind, "goal");
    assert.equal(res.body.memory.source, "You told Sovra");
    assert.equal(res.body.memory.status, "pending");

    const sent = memwal.stored.at(-1)!;
    assert.equal(sent.namespace, namespaceFor(address));
    assert.equal(sent.text, "[sovra:goal] Saving for a laptop, $1,200 by January.");

    await flushBackgroundWork();
    const [row] = await database.db.select().from(memories).where(eq(memories.id, res.body.memory.id));
    assert.equal(row.status, "stored");
    assert.equal(row.blobId, sent.blobId);
  });

  it("lists memories newest first and filters by kind", async () => {
    const { client } = await newUser();
    await client.post("/memories", { kind: "goal", text: "Laptop by January." });
    await client.post("/memories", { kind: "limit", text: "Keep entertainment under $100 a month." });

    const all = await client.get("/memories");
    assert.deepEqual(
      all.body.memories.map((m: { kind: string }) => m.kind),
      ["limit", "goal"],
    );
    assert.equal((await client.get("/memories?kind=goal")).body.memories.length, 1);
    assert.equal((await client.get("/memories?kind=nonsense")).status, 400);
  });

  it("recalls with the tag stripped and counts each use", async () => {
    const { client } = await newUser();
    const created = await client.post("/memories", { kind: "preference", text: "Bolt rides after 10 pm are for safety." });
    await flushBackgroundWork();

    const res = await client.post("/memories/recall", { query: "bolt" });
    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 1);
    assert.equal(res.body.results[0].id, created.body.memory.id);
    assert.equal(res.body.results[0].kind, "preference");
    assert.equal(res.body.results[0].text, "Bolt rides after 10 pm are for safety.");

    const [row] = await database.db.select().from(memories).where(eq(memories.id, created.body.memory.id));
    assert.equal(row.uses, 1);
  });

  it("forgets a memory so it is neither listed nor recalled", async () => {
    const { client } = await newUser();
    const created = await client.post("/memories", { kind: "decision", text: "You paused Disney+ in October." });
    await flushBackgroundWork();

    assert.deepEqual((await client.delete(`/memories/${created.body.memory.id}`)).body, { id: created.body.memory.id, forgotten: true });
    assert.equal((await client.get("/memories")).body.memories.length, 0);
    assert.equal((await client.post("/memories/recall", { query: "disney" })).body.results.length, 0);
    assert.equal((await client.delete(`/memories/${created.body.memory.id}`)).status, 404);
  });

  it("keeps each user's memories private", async () => {
    const owner = await newUser();
    const other = await newUser();
    const created = await owner.client.post("/memories", { kind: "goal", text: "Private laptop goal." });
    await flushBackgroundWork();

    assert.equal((await other.client.get("/memories")).body.memories.length, 0);
    assert.equal((await other.client.post("/memories/recall", { query: "laptop" })).body.results.length, 0);
    assert.equal((await other.client.delete(`/memories/${created.body.memory.id}`)).status, 404);
    assert.equal((await owner.client.get("/memories")).body.memories.length, 1);
  });

  it("validates memory input", async () => {
    const { client } = await newUser();
    assert.equal((await client.post("/memories", { kind: "goal", text: "x" })).status, 400);
    assert.equal((await client.post("/memories/recall", { query: "a", limit: 99 })).status, 400);
    assert.equal((await client.delete("/memories/not-a-uuid")).status, 400);
  });

  it("writes onboarding answers and learned rules as memories", async () => {
    const { client } = await newUser();
    const profile = await client.put("/me/profile", {
      name: "Ada",
      onboarded: true,
      goal: { name: "Laptop", target: 1200, due: "2027-01-31" },
      limit: { category: "entertainment", amount: 100 },
      payday: "irregular",
      sources: { csv: true, sui: false },
    });
    assert.deepEqual(
      profile.body.memories.map((m: { status: string }) => m.status),
      ["saved", "saved", "saved"],
    );

    await client.request("POST", "/transactions/import", { form: csvForm("Date,Description,Amount\n2026-10-01,Amazon,-30") });
    const [tx] = (await client.get("/transactions")).body.transactions;
    const res = await client.patch(`/transactions/${tx.id}`, { category: "business", remember: true });
    assert.equal(res.body.memory.status, "saved");
    assert.ok(res.body.transaction.learnedFrom, "the transaction links to the memory it learned from");

    const kinds = (await client.get("/memories")).body.memories.map((m: { kind: string }) => m.kind).sort();
    assert.deepEqual(kinds, ["correction", "goal", "limit", "preference"]);
  });

  it("answers from the user's own data and lists the memories it used", async () => {
    const { client } = await newUser();
    await client.post("/memories", { kind: "goal", text: "Saving for a laptop by January." });
    await flushBackgroundWork();
    await client.put("/budgets/entertainment", { limit: 100 });
    await client.post("/goals", { name: "Laptop", target: 1200, due: "2027-01-31" });
    await client.request("POST", "/transactions/import", {
      form: csvForm("Date,Description,Amount,Balance\n2026-10-01,Amazon,-30,870"),
    });

    const res = await client.post("/ask", { question: "Can I afford a laptop?" });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, "Answer to: Can I afford a laptop?");
    assert.equal(res.body.model, "fake-model");
    assert.deepEqual(
      res.body.usedMemories.map((m: { text: string }) => m.text),
      ["Saving for a laptop by January."],
    );

    const seen = ai.answers.at(-1)!;
    assert.deepEqual(seen.missing, ["Sui wallet balance"], "Tatum isn't configured, so the model is told");
    assert.deepEqual((seen.context.goals as { name: string }[]).map((g) => g.name), ["Laptop"]);
    assert.equal((seen.context.budgetsThisMonth as unknown[]).length, 1);
    assert.equal(seen.context.suiWalletUsdc, undefined);
    assert.equal(seen.context.totalBalance, 870, "the model knows what the user has");
    assert.deepEqual(seen.context.accounts, [{ name: "statement", balance: 870, currency: "USD" }]);
  });

  it("validates the question", async () => {
    const { client } = await newUser();
    assert.equal((await client.post("/ask", { question: "?" })).status, 400);
  });
});

describe("Ask Sovra without an AI key", () => {
  it("answers 503 not_configured", async () => {
    const database = await createTestDatabase();
    const api = await createTestApp({ database, ai: new FakeAi(false) });
    try {
      const client = api.client();
      await signIn(client);
      const res = await client.post("/ask", { question: "How am I doing?" });
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, "not_configured");
    } finally {
      await api.close();
      await database.close();
    }
  });
});

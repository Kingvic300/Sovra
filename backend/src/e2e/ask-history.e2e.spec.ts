import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HttpStatus } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AppError } from "../common/errors.js";
import { askMessages, users } from "../database/schema.js";
import { DemoService } from "../auth/demo.service.js";
import { FakeAi, FakeMemWal, createTestApp, flushBackgroundWork, signIn, type TestApp, type TestClient } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

type Message = { id: string; question: string; answer: string; usedMemories: { id: string | null; text: string }[]; model: string; createdAt: string };

describe("Ask Sovra history", () => {
  let database: TestDatabase;
  let api: TestApp;
  let ai: FakeAi;

  before(async () => {
    database = await createTestDatabase();
    ai = new FakeAi();
    api = await createTestApp({ database, ai, memwal: new FakeMemWal(), env: { RATE_LIMIT_ASK_PER_HOUR: "8" } });
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

  const historyOf = async (client: TestClient, query = "") => (await client.get(`/ask/history${query}`)).body as { messages: Message[]; nextCursor: string | null };

  it("saves each answered question with the memories it used", async () => {
    const { client } = await newUser();
    await client.post("/memories", { kind: "goal", text: "Saving for a laptop by January." });
    await flushBackgroundWork();

    const asked = await client.post("/ask", { question: "How is my laptop goal going?" });
    assert.equal(asked.status, 200);
    assert.match(asked.body.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(asked.body.createdAt)));

    const { messages, nextCursor } = await historyOf(client);
    assert.equal(nextCursor, null);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
      id: asked.body.id,
      question: "How is my laptop goal going?",
      answer: "Answer to: How is my laptop goal going?",
      usedMemories: asked.body.usedMemories,
      model: "fake-model",
      createdAt: asked.body.createdAt,
    });
    assert.equal(messages[0].usedMemories[0].text, "Saving for a laptop by January.");
  });

  it("doesn't save questions that failed or were refused", async () => {
    const { client, address } = await newUser();

    ai.failure = new AppError(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Sovra is busy right now.");
    try {
      assert.equal((await client.post("/ask", { question: "Groq is rate limiting" })).status, 429);
    } finally {
      ai.failure = undefined;
    }
    ai.failure = new AppError(HttpStatus.BAD_GATEWAY, "ai_upstream_error", "Couldn't reach the model.");
    try {
      assert.equal((await client.post("/ask", { question: "Groq is down" })).status, 502);
    } finally {
      ai.failure = undefined;
    }
    assert.equal((await client.post("/ask", { question: "?" })).status, 400);

    assert.deepEqual((await historyOf(client)).messages, []);
    assert.equal((await database.db.select().from(askMessages).where(eq(askMessages.userAddress, address))).length, 0);
  });

  it("doesn't save questions blocked by the rate limit", async () => {
    const { client } = await newUser();
    for (let i = 1; i <= 8; i++) assert.equal((await client.post("/ask", { question: `Question ${i}` })).status, 200);
    assert.equal((await client.post("/ask", { question: "One too many" })).status, 429);
    const all = await historyOf(client, "?limit=50");
    assert.equal(all.messages.length, 8);
    assert.ok(!all.messages.some((m) => m.question === "One too many"));
  });

  it("pages newest first without gaps or repeats", async () => {
    const { client } = await newUser();
    for (let i = 1; i <= 5; i++) await client.post("/ask", { question: `Question ${i}` });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { messages: Message[]; nextCursor: string | null } = await historyOf(client, `?limit=2${cursor ? `&before=${cursor}` : ""}`);
      assert.ok(page.messages.length <= 2);
      seen.push(...page.messages.map((m) => m.question));
      cursor = page.nextCursor;
      assert.ok(++pages <= 10, "paging must end");
    } while (cursor);

    assert.equal(pages, 3);
    assert.deepEqual(seen, ["Question 5", "Question 4", "Question 3", "Question 2", "Question 1"]);
  });

  it("keeps a stable order when messages share a timestamp", async () => {
    const { client, address } = await newUser();
    const at = new Date("2026-10-01T12:00:00.000Z");
    await database.db.insert(askMessages).values(
      ["A", "B", "C"].map((q) => ({ userAddress: address, question: q, answer: "x", model: "m", createdAt: at })),
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { messages: Message[]; nextCursor: string | null } = await historyOf(client, `?limit=1${cursor ? `&before=${cursor}` : ""}`);
      seen.push(...page.messages.map((m) => m.question));
      cursor = page.nextCursor;
      assert.ok(seen.length <= 10, "paging must end");
    } while (cursor);
    assert.deepEqual([...seen].sort(), ["A", "B", "C"]);
  });

  it("clears only the signed-in user's history", async () => {
    const owner = await newUser();
    const other = await newUser();
    await owner.client.post("/ask", { question: "Mine one" });
    await owner.client.post("/ask", { question: "Mine two" });
    await other.client.post("/ask", { question: "Theirs" });

    assert.deepEqual((await owner.client.delete("/ask/history")).body, { deleted: 2 });
    assert.deepEqual((await historyOf(owner.client)).messages, []);
    assert.equal((await historyOf(other.client)).messages.length, 1);
    assert.deepEqual((await owner.client.delete("/ask/history")).body, { deleted: 0 });

    await owner.client.post("/ask", { question: "After clearing" });
    assert.equal((await historyOf(owner.client)).messages[0].question, "After clearing");
  });

  it("keeps each user's history private, cursors included", async () => {
    const owner = await newUser();
    const other = await newUser();
    await owner.client.post("/ask", { question: "Private question" });
    await owner.client.post("/ask", { question: "Another private question" });
    const ownerFirstPage = await historyOf(owner.client, "?limit=1");

    assert.deepEqual((await historyOf(other.client)).messages, []);
    const borrowed = await other.client.get(`/ask/history?limit=1&before=${ownerFirstPage.nextCursor}`);
    assert.equal(borrowed.status, 400);
    assert.equal(borrowed.body.error.code, "invalid_cursor");
  });

  it("validates paging", async () => {
    const { client } = await newUser();
    assert.equal((await client.get("/ask/history?limit=0")).status, 400);
    assert.equal((await client.get("/ask/history?limit=51")).status, 400);
    assert.equal((await client.get("/ask/history?before=not-a-uuid")).status, 400);
    assert.equal((await client.get("/ask/history?before=00000000-0000-0000-0000-000000000000")).body.error.code, "invalid_cursor");
  });

  it("requires a session", async () => {
    const client = api.client();
    assert.equal((await client.get("/ask/history")).status, 401);
    assert.equal((await client.delete("/ask/history")).status, 401);
  });

  it("is deleted with an expired demo account", async () => {
    const client = api.client();
    const demo = (await client.post("/auth/demo")).body.user.address as string;
    await client.post("/ask", { question: "Demo question" });
    assert.equal((await historyOf(client)).messages.length, 1);

    await database.db.update(users).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(users.address, demo));
    await api.app.get(DemoService).cleanupExpired();
    assert.equal((await database.db.select().from(askMessages).where(eq(askMessages.userAddress, demo))).length, 0);
  });
});

describe("Ask Sovra history without a database", () => {
  it("still answers, without saving", async () => {
    const api = await createTestApp({ ai: new FakeAi() });
    try {
      const client = api.client();
      await signIn(client);
      const res = await client.post("/ask", { question: "Can I still ask?" });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, null);
      assert.equal((await client.get("/ask/history")).status, 503);
    } finally {
      await api.close();
    }
  });
});

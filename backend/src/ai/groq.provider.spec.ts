import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { Logger } from "@nestjs/common";
import { AppError } from "../common/errors.js";
import { loadEnv } from "../config/env.js";
import { GroqAiProvider } from "./groq.provider.js";

const env = (key?: string) =>
  loadEnv({ SESSION_SECRET: "test-session-secret-not-for-production", ...(key ? { GROQ_API_KEY: key } : {}) });

const completion = (content: string, model = "openai/gpt-oss-120b") =>
  new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status: 200 });

const answerInput = { question: "Can I afford a phone?", context: { goals: [] }, memories: [{ kind: "goal", text: "Laptop by January." }], missing: ["budgets"] };

describe("GroqAiProvider", () => {
  let fetchMock: ReturnType<typeof mock.method<typeof globalThis, "fetch">>;

  beforeEach(() => {
    Logger.overrideLogger(false);
    fetchMock = mock.method(globalThis, "fetch", async () => completion("ok"));
  });

  afterEach(() => {
    fetchMock.mock.restore();
  });

  it("is not configured without a key and never calls the network", async () => {
    const ai = new GroqAiProvider(env());
    assert.equal(ai.configured, false);
    await assert.rejects(ai.answer(answerInput), (err: unknown) => err instanceof AppError && err.code === "not_configured");
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("sends a grounded prompt and returns the answer and model", async () => {
    fetchMock.mock.mockImplementation(async () => completion("  Not this month.  "));
    const ai = new GroqAiProvider(env("gsk_test"));
    assert.deepEqual(await ai.answer(answerInput), { text: "Not this month.", model: "openai/gpt-oss-120b" });

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer gsk_test");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "openai/gpt-oss-120b");
    assert.equal(body.include_reasoning, false);
    assert.match(body.messages[0].content, /read-only/);
    assert.match(body.messages[1].content, /\[goal\] Laptop by January\./);
    assert.match(body.messages[1].content, /Data not available right now: budgets\./);
    assert.match(body.messages[1].content, /Question: Can I afford a phone\?/);
  });

  it("maps Groq 429 and 498 to rate_limited", async () => {
    for (const status of [429, 498]) {
      fetchMock.mock.mockImplementation(async () => new Response("slow down", { status }));
      await assert.rejects(
        new GroqAiProvider(env("gsk_test")).answer(answerInput),
        (err: unknown) => err instanceof AppError && err.code === "rate_limited" && err.getStatus() === 429,
      );
    }
  });

  it("maps other failures to ai_upstream_error without leaking details", async () => {
    fetchMock.mock.mockImplementation(async () => new Response("invalid api key gsk_test", { status: 401 }));
    await assert.rejects(
      new GroqAiProvider(env("gsk_test")).answer(answerInput),
      (err: unknown) => err instanceof AppError && err.code === "ai_upstream_error" && !err.message.includes("gsk_test"),
    );
  });

  it("rejects empty answers and malformed responses", async () => {
    fetchMock.mock.mockImplementation(async () => completion("   "));
    await assert.rejects(new GroqAiProvider(env("gsk_test")).answer(answerInput), /empty answer/);

    fetchMock.mock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await assert.rejects(
      new GroqAiProvider(env("gsk_test")).answer(answerInput),
      (err: unknown) => err instanceof AppError && err.code === "ai_upstream_error",
    );
  });

  it("reports timeouts with a friendly message", async () => {
    fetchMock.mock.mockImplementation(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    await assert.rejects(new GroqAiProvider(env("gsk_test")).answer(answerInput), /took too long/);
  });

  it("categorizes merchants and ignores keys or categories it wasn't asked for", async () => {
    fetchMock.mock.mockImplementation(async () =>
      completion(
        JSON.stringify({
          items: [
            { merchantKey: "netflix", category: "entertainment" },
            { merchantKey: "not-asked", category: "food" },
          ],
        }),
      ),
    );
    const result = await new GroqAiProvider(env("gsk_test")).categorize([
      { merchantKey: "netflix", example: "NETFLIX.COM", amount: -17.99 },
      { merchantKey: "mystery", example: "MYSTERY", amount: -5 },
    ]);
    assert.deepEqual([...result], [["netflix", "entertainment"]]);
  });

  it("keeps going when a categorization batch fails", async () => {
    fetchMock.mock.mockImplementation(async () => completion("not json"));
    const result = await new GroqAiProvider(env("gsk_test")).categorize([{ merchantKey: "a", example: "A", amount: -1 }]);
    assert.equal(result.size, 0);
  });

  it("sends at most 300 merchants in batches of 60", async () => {
    fetchMock.mock.mockImplementation(async () => completion(JSON.stringify({ items: [] })));
    const merchants = Array.from({ length: 400 }, (_, i) => ({ merchantKey: `m${i}`, example: `M${i}`, amount: -1 }));
    await new GroqAiProvider(env("gsk_test")).categorize(merchants);
    assert.equal(fetchMock.mock.callCount(), 5);
  });
});

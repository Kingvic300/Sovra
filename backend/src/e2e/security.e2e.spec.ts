import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AiProvider } from "../ai/ai.provider.js";
import { FakeAi, createTestApp, csvForm, signIn, type TestApp, type TestResponse } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const ip = (n: number) => ({ "x-forwarded-for": `203.0.113.${n}` });

function assertSecurityHeaders(res: TestResponse, label: string) {
  const h = res.headers;
  assert.equal(h.get("x-powered-by"), null, `${label}: X-Powered-By`);
  assert.equal(h.get("x-content-type-options"), "nosniff", label);
  assert.equal(h.get("x-frame-options"), "DENY", label);
  assert.equal(h.get("referrer-policy"), "no-referrer", label);
  assert.equal(h.get("cache-control"), "no-store", label);
  assert.match(h.get("content-security-policy") ?? "", /default-src 'none'.*frame-ancestors 'none'/, label);
}

function assertRateLimited(res: TestResponse, maxSeconds: number) {
  assert.equal(res.status, 429);
  assert.equal(res.body.error.code, "rate_limited");
  assert.match(res.body.error.message, /^Too many requests\. Try again in \d+ seconds?\.$/);
  const retryAfter = Number(res.headers.get("retry-after"));
  assert.ok(retryAfter >= 1 && retryAfter <= maxSeconds, `Retry-After ${retryAfter}`);
  assertSecurityHeaders(res, "429");
}

describe("security headers", () => {
  let database: TestDatabase;
  let api: TestApp;
  const failingAi: AiProvider = {
    configured: true,
    categorize: async () => new Map(),
    answer: async () => {
      throw new Error("unexpected failure");
    },
    extractTransactions: async () => [],
  };

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database, ai: failingAi });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  it("are on success, client error, not found and server error responses", async () => {
    const client = api.client();
    const ok = await client.get("/health");
    assert.equal(ok.status, 200);
    assertSecurityHeaders(ok, "200");

    const unauthorized = await client.get("/me");
    assert.equal(unauthorized.status, 401);
    assertSecurityHeaders(unauthorized, "401");

    const missing = await client.get("/nowhere");
    assert.equal(missing.status, 404);
    assertSecurityHeaders(missing, "404");

    await signIn(client);
    const crashed = await client.post("/ask", { question: "Will this fail?" });
    assert.equal(crashed.status, 500);
    assert.deepEqual(crashed.body, { error: { code: "internal_error", message: "Something went wrong on our side." } });
    assertSecurityHeaders(crashed, "500");
  });

  it("are on CORS preflight responses, which still allow the frontend origin", async () => {
    const res = await api.client().request("OPTIONS", "/me", {
      headers: { origin: "http://localhost:5173", "access-control-request-method": "PUT" },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("only send HSTS in production", async () => {
    assert.equal((await api.client().get("/health")).headers.get("strict-transport-security"), null);
    const production = await createTestApp({ env: { NODE_ENV: "production" } });
    try {
      assert.equal(
        (await production.client().get("/health")).headers.get("strict-transport-security"),
        "max-age=31536000; includeSubDomains",
      );
    } finally {
      await production.close();
    }
  });

  it("answer malformed and oversized requests in the standard error shape", async () => {
    const client = api.client();
    const malformed = await client.request("POST", "/auth/nonce", { headers: { "content-type": "application/json" }, json: undefined });
    assert.equal(malformed.status, 400);

    const bad = await fetch(`${api.baseUrl}/api/auth/nonce`, { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as { error: { code: string } }).error.code, "bad_request");

    const huge = await client.post("/auth/nonce", { address: "a".repeat(200_000) });
    assert.equal(huge.status, 413);
    assert.equal(huge.body.error.code, "payload_too_large");
    assertSecurityHeaders(huge, "413");

    await signIn(client);
    const bigCsv = `Date,Description,Amount\n${"2026-10-01,Shop,-1\n".repeat(320_000)}`;
    const tooBig = await client.request("POST", "/transactions/import?preview=1", { form: csvForm(bigCsv) });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.error.code, "payload_too_large");
  });
});

describe("rate limiting", () => {
  let database: TestDatabase;
  let api: TestApp;
  const ai = new FakeAi();

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({
      database,
      ai,
      env: {
        RATE_LIMIT_AUTH_PER_MINUTE: "3",
        RATE_LIMIT_DEMO_PER_HOUR: "2",
        RATE_LIMIT_ASK_PER_HOUR: "2",
        RATE_LIMIT_IMPORT_PER_HOUR: "2",
      },
    });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  /** Signs in from a fresh IP (so sign-ins don't use up the auth limit), then acts from `from`. */
  let signInIp = 100;
  async function userAt(from: Record<string, string>) {
    const signer = api.client(ip(signInIp++));
    await signIn(signer);
    const client = api.client(from);
    client.cookie = signer.cookie;
    return client;
  }

  it("limits sign-in attempts per IP across nonce and verify", async () => {
    const attacker = api.client(ip(1));
    const address = `0x${"1".repeat(64)}`;
    for (let i = 0; i < 3; i++) assert.equal((await attacker.post("/auth/nonce", { address })).status, 200);
    assertRateLimited(await attacker.post("/auth/nonce", { address }), 60);
    assertRateLimited(await attacker.post("/auth/verify", { address, message: "x".repeat(20), signature: "y".repeat(20) }), 60);

    // Someone else is unaffected.
    assert.equal((await api.client(ip(2)).post("/auth/nonce", { address })).status, 200);
  });

  it("limits demo sessions per IP per hour", async () => {
    const visitor = api.client(ip(3));
    assert.equal((await visitor.post("/auth/demo")).status, 200);
    assert.equal((await visitor.post("/auth/demo")).status, 200);
    const blocked = await visitor.post("/auth/demo");
    assertRateLimited(blocked, 3600);
    assert.ok(Number(blocked.headers.get("retry-after")) > 60, "the demo window is an hour");
    assert.equal((await api.client(ip(4)).post("/auth/demo")).status, 200);
  });

  it("limits Ask Sovra per user, wherever the requests come from", async () => {
    const alice = await userAt(ip(5));
    const bob = await userAt(ip(5)); // same IP as Alice
    const asked = ai.answers.length;

    assert.equal((await alice.post("/ask", { question: "First question" })).status, 200);
    assert.equal((await alice.post("/ask", { question: "Second question" })).status, 200);
    assertRateLimited(await alice.post("/ask", { question: "Third question" }), 3600);

    // Alice from another network is still Alice.
    const aliceElsewhere = api.client(ip(6));
    aliceElsewhere.cookie = alice.cookie;
    assertRateLimited(await aliceElsewhere.post("/ask", { question: "From my phone" }), 3600);

    // Bob shares Alice's IP but has his own allowance.
    assert.equal((await bob.post("/ask", { question: "Bob's question" })).status, 200);
    assert.equal(ai.answers.length, asked + 3, "blocked questions never reach the AI model");
  });

  it("limits statement uploads per user, previews included", async () => {
    const statement = csvForm("Date,Description,Amount\n2026-10-01,Shop,-5");
    const alice = await userAt(ip(7));
    assert.equal((await alice.request("POST", "/transactions/import?preview=1", { form: statement })).status, 201);
    assert.equal((await alice.request("POST", "/transactions/import", { form: statement })).status, 201);
    assertRateLimited(await alice.request("POST", "/transactions/import", { form: statement }), 3600);

    const bob = await userAt(ip(7));
    assert.equal((await bob.request("POST", "/transactions/import?preview=1", { form: statement })).status, 201);
  });

  it("still requires a session before a user-limited route does anything", async () => {
    const anonymous = api.client(ip(8));
    assert.equal((await anonymous.post("/ask", { question: "Who am I?" })).status, 401);
  });
});

describe("global rate limit", () => {
  it("caps all requests per IP and leaves other IPs alone", async () => {
    const api = await createTestApp({ env: { RATE_LIMIT_GLOBAL_PER_MINUTE: "5" } });
    try {
      const busy = api.client(ip(9));
      for (let i = 0; i < 5; i++) assert.equal((await busy.get("/health")).status, 200);
      assertRateLimited(await busy.get("/health"), 60);
      assertRateLimited(await busy.post("/auth/demo"), 60);
      assert.equal((await api.client(ip(10)).get("/health")).status, 200);
    } finally {
      await api.close();
    }
  });

  it("uses the socket address when TRUST_PROXY is false, so forwarded headers can't dodge limits", async () => {
    const api = await createTestApp({ env: { RATE_LIMIT_GLOBAL_PER_MINUTE: "2", TRUST_PROXY: "false" } });
    try {
      assert.equal((await api.client(ip(11)).get("/health")).status, 200);
      assert.equal((await api.client(ip(12)).get("/health")).status, 200);
      assertRateLimited(await api.client(ip(13)).get("/health"), 60);
    } finally {
      await api.close();
    }
  });
});

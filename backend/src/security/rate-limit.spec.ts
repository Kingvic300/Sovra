import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { loadEnv } from "../config/env.js";
import { RateLimitStore, rateLimitRules } from "./rate-limit.js";

const env = (extra: Record<string, string> = {}) => loadEnv({ SESSION_SECRET: "test-session-secret-not-for-production", ...extra });

describe("RateLimitStore", () => {
  it("allows up to the limit in a window, then blocks with the seconds left", () => {
    const store = new RateLimitStore();
    const t0 = 1_000_000;
    assert.equal(store.hit("k", 2, 60_000, t0).allowed, true);
    assert.equal(store.hit("k", 2, 60_000, t0 + 1).allowed, true);
    assert.deepEqual(store.hit("k", 2, 60_000, t0 + 15_000), { allowed: false, retryAfterSeconds: 45 });
  });

  it("starts a fresh window once the old one ends", () => {
    const store = new RateLimitStore();
    store.hit("k", 1, 1000, 0);
    assert.equal(store.hit("k", 1, 1000, 500).allowed, false);
    assert.equal(store.hit("k", 1, 1000, 1000).allowed, true);
  });

  it("counts keys separately", () => {
    const store = new RateLimitStore();
    store.hit("a", 1, 1000, 0);
    assert.equal(store.hit("a", 1, 1000, 0).allowed, false);
    assert.equal(store.hit("b", 1, 1000, 0).allowed, true);
  });

  it("never asks a client to wait less than a second", () => {
    const store = new RateLimitStore();
    store.hit("k", 1, 1000, 0);
    assert.equal(store.hit("k", 1, 1000, 999).retryAfterSeconds, 1);
  });

  it("forgets expired windows so memory stays bounded", () => {
    const store = new RateLimitStore();
    for (let i = 0; i < 100; i++) store.hit(`ip-${i}`, 5, 1000, 0);
    assert.equal(store.size, 100);
    store.hit("later", 5, 1000, 120_000);
    assert.equal(store.size, 1);
  });
});

describe("rate limit settings", () => {
  it("has safe defaults", () => {
    const rules = rateLimitRules(env());
    assert.deepEqual(rules.global, { limit: 300, windowMs: 60_000, by: "ip" });
    assert.deepEqual(rules.auth, { limit: 20, windowMs: 60_000, by: "ip" });
    assert.deepEqual(rules.demo, { limit: 10, windowMs: 3_600_000, by: "ip" });
    assert.deepEqual(rules.ask, { limit: 30, windowMs: 3_600_000, by: "user" });
    assert.deepEqual(rules.import, { limit: 30, windowMs: 3_600_000, by: "user" });
    assert.deepEqual(rules.demoAsk, { limit: 10, windowMs: 3_600_000, by: "ip" });
  });

  it("reads limits from the environment", () => {
    assert.equal(rateLimitRules(env({ RATE_LIMIT_ASK_PER_HOUR: "5" })).ask.limit, 5);
  });

  it("rejects limits that aren't positive whole numbers", () => {
    const exit = mock.method(process, "exit", () => {
      throw new Error("exit called");
    });
    const error = mock.method(console, "error", () => {});
    try {
      assert.throws(() => env({ RATE_LIMIT_AUTH_PER_MINUTE: "0" }), /exit called/);
      assert.match(String(error.mock.calls[0].arguments[0]), /RATE_LIMIT_AUTH_PER_MINUTE/);
    } finally {
      exit.mock.restore();
      error.mock.restore();
    }
  });

  it("parses TRUST_PROXY as hops, false, or a list", () => {
    assert.equal(env().TRUST_PROXY, 1);
    assert.equal(env({ TRUST_PROXY: "2" }).TRUST_PROXY, 2);
    assert.equal(env({ TRUST_PROXY: "false" }).TRUST_PROXY, false);
    assert.equal(env({ TRUST_PROXY: "loopback" }).TRUST_PROXY, "loopback");
  });
});

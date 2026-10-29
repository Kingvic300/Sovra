import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { JwtService } from "@nestjs/jwt";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { eq } from "drizzle-orm";
import { authNonces, users } from "../database/schema.js";
import { createTestApp, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

describe("auth and sessions (with database)", () => {
  let database: TestDatabase;
  let api: TestApp;

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  it("reports which integrations are configured", async () => {
    const res = await api.client().get("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok", services: { database: true, tatum: false, walrusMemory: false, ai: false } });
  });

  it("signs in with a signed challenge and sets an HTTP-only session cookie", async () => {
    const client = api.client();
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();

    const challenge = await client.post("/auth/nonce", { address });
    assert.equal(challenge.status, 200);
    assert.match(challenge.body.message, new RegExp(`^Sign in to Sovra\\n\\nAddress: ${address}\\nNonce: [0-9a-f]{32}\\n`));

    const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(challenge.body.message));
    const res = await client.post("/auth/verify", {
      address,
      message: challenge.body.message,
      signature,
      name: "Ada Okafor",
      email: "ada@example.com",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { user: { address, method: "google", name: "Ada Okafor", email: "ada@example.com" } });

    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /^sovra_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Path=\//);
    assert.doesNotMatch(setCookie, /Secure/, "cookie is only Secure in production");

    const me = await client.get("/me");
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, { user: { address, method: "google", name: "Ada Okafor", email: "ada@example.com" }, profile: null });

    const [row] = await database.db.select().from(users).where(eq(users.address, address));
    assert.equal(row.method, "google");
    assert.equal(row.email, "ada@example.com");
  });

  it("signs in without Google profile claims and keeps the ones saved earlier", async () => {
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();
    const nameOf = async () => (await database.db.select().from(users).where(eq(users.address, address)))[0];

    await signIn(api.client(), keypair);
    assert.deepEqual({ ...(await nameOf()), createdAt: undefined }, { address, method: "google", name: null, email: null, createdAt: undefined, expiresAt: null, passwordHash: null }, "real accounts never expire");

    await signIn(api.client(), keypair, { name: "Ada Okafor", email: "ada@example.com" });
    assert.equal((await nameOf()).name, "Ada Okafor");

    await signIn(api.client(), keypair);
    assert.equal((await nameOf()).name, "Ada Okafor");
    assert.equal((await nameOf()).email, "ada@example.com");

    await signIn(api.client(), keypair, { name: "Ada O." });
    assert.equal((await nameOf()).name, "Ada O.");
    assert.equal((await nameOf()).email, "ada@example.com");
  });

  it("uses each challenge only once", async () => {
    const client = api.client();
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();
    const challenge = await client.post("/auth/nonce", { address });
    const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(challenge.body.message));
    const body = { address, message: challenge.body.message, signature };

    assert.equal((await client.post("/auth/verify", body)).status, 200);
    const replay = await api.client().post("/auth/verify", body);
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, "unauthorized");
  });

  it("rejects expired challenges", async () => {
    const client = api.client();
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();
    const challenge = await client.post("/auth/nonce", { address });
    await database.db.update(authNonces).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authNonces.address, address));
    const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(challenge.body.message));

    const res = await client.post("/auth/verify", { address, message: challenge.body.message, signature });
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /expired/);
  });

  it("rejects a signature from a different key", async () => {
    const client = api.client();
    const address = Ed25519Keypair.generate().toSuiAddress();
    const challenge = await client.post("/auth/nonce", { address });
    const { signature } = await Ed25519Keypair.generate().signPersonalMessage(new TextEncoder().encode(challenge.body.message));

    const res = await client.post("/auth/verify", { address, message: challenge.body.message, signature });
    assert.equal(res.status, 401);
    assert.equal(client.cookie, undefined);
  });

  it("rejects a challenge issued for another address", async () => {
    const client = api.client();
    const victim = Ed25519Keypair.generate().toSuiAddress();
    const attacker = Ed25519Keypair.generate();
    const challenge = await client.post("/auth/nonce", { address: victim });
    const { signature } = await attacker.signPersonalMessage(new TextEncoder().encode(challenge.body.message));

    const res = await client.post("/auth/verify", { address: attacker.toSuiAddress(), message: challenge.body.message, signature });
    assert.equal(res.status, 401);
  });

  it("validates addresses and request bodies", async () => {
    const client = api.client();
    const bad = await client.post("/auth/nonce", { address: "not-an-address!" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "invalid_address");

    const missing = await client.post("/auth/verify", {});
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, "invalid_request");
  });

  it("starts a demo session on its own short-lived account", async () => {
    const client = api.client();
    const res = await client.post("/auth/demo");
    assert.equal(res.status, 200);
    assert.match(res.body.user.address, /^0x[0-9a-f]{64}$/);
    assert.equal(res.body.user.method, "demo");
    assert.match(res.headers.get("set-cookie") ?? "", /Max-Age=86400/, "the demo cookie lasts as long as the demo account");
    assert.equal((await client.get("/me")).status, 200);
  });

  it("logs out by clearing the cookie", async () => {
    const client = api.client();
    await signIn(client);
    const res = await client.post("/auth/logout");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") ?? "", /^sovra_session=;/);
    assert.equal(client.cookie, undefined);
    assert.equal((await client.get("/me")).status, 401);
  });

  it("rejects missing, tampered and foreign-signed session cookies", async () => {
    const anonymous = api.client();
    const none = await anonymous.get("/me");
    assert.equal(none.status, 401);
    assert.deepEqual(none.body, { error: { code: "unauthorized", message: "Sign in to continue." } });

    const client = api.client();
    await signIn(client);
    const tampered = api.client();
    tampered.cookie = `${client.cookie}x`;
    assert.equal((await tampered.get("/me")).status, 401);

    const forged = api.client();
    const token = await new JwtService({ secret: "some-other-secret-value" }).signAsync({ sub: `0x${"7".repeat(64)}`, method: "google" });
    forged.cookie = `sovra_session=${token}`;
    assert.equal((await forged.get("/me")).status, 401);
  });

  it("requires a session on every private route", async () => {
    const client = api.client();
    const routes: [string, string][] = [
      ["GET", "/me"],
      ["PUT", "/me/profile"],
      ["GET", "/wallet/balance"],
      ["GET", "/wallet/transactions"],
      ["GET", "/wallet/deposit"],
      ["GET", "/memories"],
      ["POST", "/memories"],
      ["POST", "/memories/recall"],
      ["DELETE", "/memories/00000000-0000-0000-0000-000000000000"],
      ["GET", "/transactions"],
      ["POST", "/transactions/import"],
      ["PATCH", "/transactions/00000000-0000-0000-0000-000000000000"],
      ["GET", "/budgets"],
      ["PUT", "/budgets/food"],
      ["DELETE", "/budgets/food"],
      ["GET", "/goals"],
      ["POST", "/goals"],
      ["PATCH", "/goals/00000000-0000-0000-0000-000000000000"],
      ["DELETE", "/goals/00000000-0000-0000-0000-000000000000"],
      ["GET", "/recurring"],
      ["POST", "/ask"],
    ];
    for (const [method, path] of routes) {
      const res = await client.request(method, path, method === "GET" ? {} : { json: {} });
      assert.equal(res.status, 401, `${method} ${path} should need a session`);
    }
  });

  it("returns 404 in the standard error shape for unknown routes", async () => {
    const res = await api.client().get("/does-not-exist");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "not_found");
  });
});

describe("auth and sessions (without database)", () => {
  let api: TestApp;

  before(async () => {
    api = await createTestApp();
  });

  after(async () => {
    await api.close();
  });

  it("still signs users in, keeping challenges in memory", async () => {
    const client = api.client();
    const { address } = await signIn(client);
    const me = await client.get("/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.address, address);
    assert.equal(me.body.profile, null);
  });

  it("answers 503 not_configured on routes that need the database", async () => {
    const client = api.client();
    await signIn(client);
    for (const path of ["/budgets", "/goals", "/transactions", "/recurring"]) {
      const res = await client.get(path);
      assert.equal(res.status, 503, path);
      assert.equal(res.body.error.code, "not_configured");
    }
  });

  it("answers 503 for Tatum, Walrus Memory and Ask without keys", async () => {
    const client = api.client();
    await signIn(client);
    assert.equal((await client.get("/wallet/balance")).body.error.code, "not_configured");
    assert.equal((await client.get("/memories")).status, 503);
    assert.equal((await client.post("/ask", { question: "How am I doing?" })).body.error.code, "not_configured");
  });

  it("serves deposit details without Tatum", async () => {
    const client = api.client();
    const { address } = await signIn(client);
    const res = await client.get("/wallet/deposit");
    assert.equal(res.status, 200);
    assert.equal(res.body.address, address);
    assert.equal(res.body.token, "USDC");
    assert.equal(res.body.decimals, 6);
  });
});

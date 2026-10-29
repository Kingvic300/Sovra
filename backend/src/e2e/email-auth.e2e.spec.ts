import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { users } from "../database/schema.js";
import { createTestApp, FakeTatum, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

describe("email and password accounts", () => {
  let database: TestDatabase;
  let api: TestApp;

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database, tatum: new FakeTatum() });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  it("signs up, stores only a hash, and starts a session", async () => {
    const client = api.client();
    const res = await client.post("/auth/signup", { email: " Ada@Example.com ", password: "correct horse", name: "Ada" });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.method, "email");
    assert.equal(res.body.user.email, "ada@example.com");
    assert.match(res.body.user.address, /^0x[0-9a-f]{64}$/);
    assert.match(res.headers.get("set-cookie") ?? "", /^sovra_session=.*HttpOnly/);

    const [row] = await database.db.select().from(users).where(eq(users.address, res.body.user.address));
    assert.match(row.passwordHash ?? "", /^scrypt\$/);
    assert.ok(!row.passwordHash?.includes("correct horse"));

    const me = await client.get("/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.address, res.body.user.address);
  });

  it("refuses a second account for the same email, in any case", async () => {
    const res = await api.client().post("/auth/signup", { email: "ADA@example.com", password: "another password" });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "email_taken");
  });

  it("validates the email and password length", async () => {
    const short = await api.client().post("/auth/signup", { email: "bo@example.com", password: "short" });
    assert.equal(short.status, 400);
    const bad = await api.client().post("/auth/signup", { email: "not-an-email", password: "long enough" });
    assert.equal(bad.status, 400);
  });

  it("logs in with the right password to the same account", async () => {
    const signup = await api.client().post("/auth/signup", { email: "cy@example.com", password: "cy password 1" });
    const client = api.client();
    const res = await client.post("/auth/login", { email: "CY@example.com", password: "cy password 1" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.address, signup.body.user.address);
    assert.equal((await client.get("/goals")).status, 200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await api.client().post("/auth/login", { email: "cy@example.com", password: "nope nope" });
    const unknown = await api.client().post("/auth/login", { email: "nobody@example.com", password: "nope nope" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  it("never shows an email account's id as a wallet", async () => {
    const client = api.client();
    await client.post("/auth/signup", { email: "di@example.com", password: "di password 1" });
    for (const path of ["/wallet/balance", "/wallet/deposit", "/wallet/transactions"]) {
      const res = await client.get(path);
      assert.equal(res.status, 409, path);
      assert.equal(res.body.error.code, "no_wallet");
    }
    const accounts = await client.get("/accounts");
    assert.equal(accounts.body.wallet.status, "no_wallet");
    assert.equal(accounts.body.wallet.usdc, null);
  });

  it("lets a wallet account add email sign-in, then open the same account with it", async () => {
    const wallet = api.client();
    const { address } = await signIn(wallet);
    const added = await wallet.post("/auth/password", { email: "Ed@Example.com", password: "ed password 1" });
    assert.equal(added.status, 200);
    assert.equal(added.body.user.email, "ed@example.com");
    assert.equal((await wallet.get("/me")).body.passwordEmail, "ed@example.com");

    const other = api.client();
    const res = await other.post("/auth/login", { email: "ed@example.com", password: "ed password 1" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.address, address);
    assert.equal(res.body.user.method, "google", "it stays a wallet account");
    assert.equal((await other.get("/wallet/balance")).status, 200, "and keeps its wallet");
  });

  it("refuses an email another account already signs in with", async () => {
    const wallet = api.client();
    await signIn(wallet);
    const res = await wallet.post("/auth/password", { email: "ada@example.com", password: "long enough" });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "email_taken");
    const signup = await api.client().post("/auth/signup", { email: "ed@example.com", password: "long enough" });
    assert.equal(signup.status, 409, "a linked email can't be used for a new account");
  });

  it("only lets wallet accounts add email sign-in", async () => {
    const client = api.client();
    await client.post("/auth/signup", { email: "fi@example.com", password: "fi password 1" });
    const res = await client.post("/auth/password", { email: "fi2@example.com", password: "fi password 2" });
    assert.equal(res.status, 400);
    assert.equal((await api.client().post("/auth/password", { email: "x@example.com", password: "long enough" })).status, 401);
  });
});

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { agentKeys } from "../database/schema.js";
import { FakeAi, FakeMemWal, createTestApp, csvForm, flushBackgroundWork, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const today = new Date().toISOString().slice(0, 10);
const STATEMENT = ["Date,Description,Amount", `${today},Netflix,-17.99`, `${today},Shoprite,-42.10`].join("\n");

describe("spending guard", () => {
  let database: TestDatabase;
  let api: TestApp;

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database, memwal: new FakeMemWal(), ai: new FakeAi() });
  });
  beforeEach(() => database.reset());
  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  async function user() {
    const client = api.client();
    const { address } = await signIn(client);
    await client.request("POST", "/transactions/import", { form: csvForm(STATEMENT) });
    return { client, address };
  }

  it("checks a person's payment against their statement and rules, and logs it", async () => {
    const { client } = await user();
    const known = await client.post("/guard/check", { payee: "Netflix", amount: 17.99, category: "entertainment" });
    assert.equal(known.status, 200);
    assert.equal(known.body.decision, "allow");

    const lookalike = await client.post("/guard/check", { payee: "Netfl1x", amount: 17.99 });
    assert.notEqual(lookalike.body.decision, "allow");
    assert.ok(lookalike.body.reasons.some((r: { code: string }) => r.code === "lookalike_payee"));

    await client.put("/guard/policy", { blockedPayees: ["Netfl1x"] });
    assert.equal((await client.post("/guard/check", { payee: "netfl1x", amount: 1 })).body.decision, "deny");

    const overview = await client.get("/guard");
    assert.deepEqual(overview.body.policy.blockedPayees, ["Netfl1x"]);
    assert.equal(overview.body.checks.length, 3);
  });

  it("lets an agent key check payments only within its allowance, and stores only the key's hash", async () => {
    const { client, address } = await user();
    const created = await client.post("/guard/keys", { name: "Bills bot", monthlyAllowance: 50, categories: ["entertainment"] });
    assert.equal(created.status, 201);
    const key: string = created.body.key;
    assert.match(key, /^sovra_ak_[\w-]{43}$/);
    const [stored] = await database.db.select().from(agentKeys).where(eq(agentKeys.userAddress, address));
    assert.notEqual(stored.keyHash, key);
    assert.ok(!JSON.stringify(stored).includes(key));

    const agent = api.client();
    const auth = { authorization: `Bearer ${key}` };
    const check = (json: unknown) => agent.request("POST", "/guard/agent/check", { json, headers: auth });

    const first = await check({ payee: "Netflix", amount: 30, category: "entertainment" });
    assert.equal(first.body.decision, "allow");
    assert.deepEqual(first.body.allowance, { monthly: 50, used: 30 });
    assert.equal((await check({ payee: "Netflix", amount: 30, category: "entertainment" })).body.decision, "deny");
    assert.equal((await check({ payee: "Shoprite", amount: 5, category: "food" })).body.decision, "deny");

    // No key, a wrong key, or the session's own routes: refused.
    assert.equal((await api.client().post("/guard/agent/check", { payee: "Netflix", amount: 1 })).status, 401);
    assert.equal((await agent.request("POST", "/guard/agent/check", { json: { payee: "x", amount: 1 }, headers: { authorization: "Bearer sovra_ak_nope" } })).status, 401);
    assert.equal((await agent.request("GET", "/guard", { headers: auth })).status, 401);

    const keys = (await client.get("/guard")).body.keys;
    assert.equal(keys[0].usedThisMonth, 30);
    assert.equal(keys[0].prefix, key.slice(0, 15));

    assert.equal((await client.delete(`/guard/keys/${created.body.id}`)).status, 204);
    const revoked = await check({ payee: "Netflix", amount: 1, category: "entertainment" });
    assert.equal(revoked.body.decision, "deny");
    assert.ok(revoked.body.reasons.some((r: { code: string }) => r.code === "key_revoked"));
  });

  it("leaves key hashes out of the data export", async () => {
    const { client } = await user();
    await client.post("/guard/keys", { name: "Shopper", monthlyAllowance: 10 });
    const exported = await client.get("/me/export");
    assert.equal(exported.body.data.agentKeys.length, 1);
    assert.equal("keyHash" in exported.body.data.agentKeys[0], false);
  });
});

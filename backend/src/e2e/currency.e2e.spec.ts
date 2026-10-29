import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { FakeFx, createTestApp, csvForm, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";
import { detectCurrency, formatMoney } from "../shared/currency.js";

const PROFILE = { name: "Victor", onboarded: true, sources: { csv: true, sui: true } };
const NAIRA_STATEMENT = [
  "Trans. Date,Description,Debit(₦),Credit(₦),Balance After(₦)",
  "01/10/2026,Shoprite,15000,--,135000",
  "02/10/2026,Salary,--,300000,435000",
].join("\n");

describe("currencies", () => {
  let database: TestDatabase;
  let api: TestApp;
  const fx = new FakeFx();

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database, fx });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  it("finds a statement's currency in its headers or amounts", () => {
    assert.equal(detectCurrency(["Date", "Debit(₦)"]), "NGN");
    assert.equal(detectCurrency(["Date", "Amount (GBP)"]), "GBP");
    assert.equal(detectCurrency(["Date", "Amount"], ["€12.50"]), "EUR");
    assert.equal(detectCurrency(["Date", "Amount"], ["12.50"]), null);
    assert.equal(formatMoney(12500, "NGN"), "₦12,500");
  });

  it("saves the profile currency and words new memories in it", async () => {
    const client = api.client();
    await signIn(client);
    const res = await client.put("/me/profile", { ...PROFILE, currency: "ngn", limit: { category: "food", amount: 50000 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.profile.currency, "NGN");
    assert.equal(res.body.memories.find((m: { kind: string }) => m.kind === "limit")?.text, "Keep food and groceries under ₦50,000 a month.");
    const kept = await client.put("/me/profile", PROFILE);
    assert.equal(kept.body.profile.currency, "NGN", "leaving currency out keeps it");
    assert.equal((await client.put("/me/profile", { ...PROFILE, currency: "naira" })).status, 400);
  });

  it("detects a Naira statement and keeps its amounts in Naira", async () => {
    const client = api.client();
    await signIn(client);
    await client.put("/me/profile", { ...PROFILE, currency: "NGN" });
    const preview = await client.request("POST", "/transactions/import?preview=1", { form: csvForm(NAIRA_STATEMENT) });
    assert.equal(preview.body.currency, "NGN");
    const saved = await client.request("POST", "/transactions/import", { form: csvForm(NAIRA_STATEMENT, "gtb.csv") });
    assert.equal(saved.body.account.currency, "NGN");
    const accounts = await client.get("/accounts");
    assert.equal(accounts.body.accounts[0].currency, "NGN");
    assert.equal(accounts.body.accounts[0].balance, 435000);
  });

  it("converts other currencies into the user's for totals and budgets", async () => {
    const client = api.client();
    await signIn(client);
    await client.put("/me/profile", { ...PROFILE, currency: "USD" });
    await client.request("POST", "/transactions/import", { form: csvForm(NAIRA_STATEMENT, "gtb.csv") });
    await client.put("/budgets/food", { limit: 20 });

    const summary = await client.get("/accounts/summary");
    assert.equal(summary.body.currency, "USD");
    assert.equal(summary.body.banks, 290, "₦435,000 at ₦1,500 per $1");
    assert.deepEqual(summary.body.fx, { date: "2026-10-29", perUsd: 1, source: { name: "ExchangeRate-API", url: "https://www.exchangerate-api.com" } });

    const budgets = await client.get("/budgets?month=2026-10");
    const food = budgets.body.budgets.find((b: { category: string }) => b.category === "food");
    assert.equal(food.spent, 10, "₦15,000 of groceries is $10");
  });

  it("leaves out what it can't convert instead of guessing", async () => {
    const client = api.client();
    await signIn(client);
    await client.put("/me/profile", { ...PROFILE, currency: "USD" });
    await client.request("POST", "/transactions/import", { form: csvForm(NAIRA_STATEMENT, "gtb.csv") });
    const saved = fx.value;
    fx.value = null;
    try {
      const summary = await client.get("/accounts/summary");
      assert.equal(summary.body.total, null);
      assert.deepEqual(summary.body.missing.map((m: { reason: string }) => m.reason), ["no_rate", "not_configured"]);
      assert.equal(summary.body.fx, null);
    } finally {
      fx.value = saved;
    }
  });

  it("gives the rate for a currency, for example amounts in setup", async () => {
    const client = api.client();
    await signIn(client);
    const res = await client.get("/fx/rate?currency=ngn");
    assert.deepEqual({ currency: res.body.currency, perUsd: res.body.perUsd, date: res.body.date }, { currency: "NGN", perUsd: 1500, date: "2026-10-29" });
    assert.equal((await client.get("/fx/rate?currency=ZZZ")).body.perUsd, null);
    assert.equal((await api.client().get("/fx/rate?currency=NGN")).status, 401);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AgentScope, DEFAULT_RULES, evaluate, foldName, type GuardContext, PolicyRules } from "./policy.js";

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  knownPayees: ["Netflix", "PayPal", "Shoprite", "Landlord Okafor"],
  knownAddresses: ["0x7a3f9c2d11e04b5a8c6d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1"],
  pastAmountsToPayee: [],
  approvedToday: 0,
  ...over,
});

const agent = (over: Partial<AgentScope> = {}): AgentScope => ({
  name: "Bills bot",
  monthlyAllowance: 200,
  usedThisMonth: 0,
  maxPerPayment: null,
  categories: [],
  expired: false,
  revoked: false,
  ...over,
});

const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code);

describe("evaluate", () => {
  it("allows an ordinary payment to someone the user already pays", () => {
    const r = evaluate({ payee: "Netflix", amount: 17.99, category: "entertainment" }, DEFAULT_RULES, ctx());
    assert.equal(r.decision, "allow");
    assert.equal(r.risk, 0);
  });

  it("asks before a large first payment to someone new", () => {
    const r = evaluate({ payee: "Bright Movers", amount: 250 }, DEFAULT_RULES, ctx());
    assert.equal(r.decision, "needs_approval");
    assert.ok(codes(r).includes("new_payee"));
  });

  it("denies blocked payees, blocked categories and amounts over the hard limit", () => {
    const rules = PolicyRules.parse({ blockedPayees: ["Bet9ja"], blockedCategories: ["shopping"], maxPerPayment: 1000 });
    assert.equal(evaluate({ payee: "BET9JA", amount: 5 }, rules, ctx()).decision, "deny");
    assert.equal(evaluate({ payee: "Shoprite", amount: 5, category: "shopping" }, rules, ctx()).decision, "deny");
    assert.ok(codes(evaluate({ payee: "Shoprite", amount: 1500 }, rules, ctx())).includes("max_per_payment"));
  });

  it("enforces the daily limit across approved payments", () => {
    const rules = PolicyRules.parse({ dailyLimit: 100 });
    assert.equal(evaluate({ payee: "Shoprite", amount: 30 }, rules, ctx({ approvedToday: 80 })).decision, "deny");
    assert.equal(evaluate({ payee: "Shoprite", amount: 20 }, rules, ctx({ approvedToday: 80 })).decision, "allow");
  });

  it("asks when a payment would push a budget over", () => {
    const r = evaluate({ payee: "Netflix", amount: 20, category: "entertainment" }, DEFAULT_RULES, ctx({ budget: { label: "Entertainment", limit: 100, projected: 90 } }));
    assert.equal(r.decision, "needs_approval");
    assert.ok(codes(r).includes("budget_over"));
  });
});

describe("scam detection", () => {
  it("folds lookalike spellings to the same name", () => {
    assert.equal(foldName("PayPaI Inc."), foldName("paypal"));
    assert.equal(foldName("Netfl1x"), foldName("Netflix"));
    assert.equal(foldName("Ρaypal"), foldName("Paypal")); // Greek capital rho
  });

  it("flags a lookalike of a known payee", () => {
    const r = evaluate({ payee: "Netfl1x Billing", amount: 17.99 }, DEFAULT_RULES, ctx());
    assert.ok(codes(r).includes("lookalike_payee"));
    assert.notEqual(r.decision, "allow");
  });

  it("flags mixed alphabets", () => {
    const r = evaluate({ payee: "Shоprite", amount: 10 }, DEFAULT_RULES, ctx()); // Cyrillic o
    assert.ok(codes(r).includes("mixed_script"));
  });

  it("catches address poisoning: same start and end, different middle", () => {
    const real = ctx().knownAddresses[0];
    const fake = real.slice(0, 6) + "f".repeat(real.length - 10) + real.slice(-4);
    const r = evaluate({ payee: "Landlord Okafor", amount: 50, payeeAddress: fake }, DEFAULT_RULES, ctx());
    assert.ok(codes(r).includes("address_poisoning"));
    assert.ok(r.risk >= 60);
    assert.equal(evaluate({ payee: "Landlord Okafor", amount: 50, payeeAddress: real }, DEFAULT_RULES, ctx()).decision, "allow");
  });

  it("reads scam language in the memo", () => {
    const r = evaluate({ payee: "Customs Desk", amount: 300, memo: "URGENT: pay the release fee in gift cards or your parcel is destroyed" }, DEFAULT_RULES, ctx());
    assert.ok(r.reasons.filter((x) => x.code === "scam_language").length >= 2);
    assert.equal(r.decision, "needs_approval");
  });

  it("trusted payees skip lookalike and new-payee warnings", () => {
    const rules = PolicyRules.parse({ trustedPayees: ["Netflx Studios"] });
    const r = evaluate({ payee: "Netflx Studios", amount: 150 }, rules, ctx());
    assert.ok(!codes(r).includes("lookalike_payee"));
    assert.ok(!codes(r).includes("new_payee"));
  });

  it("notices an amount far above the usual for this payee", () => {
    const r = evaluate({ payee: "Netflix", amount: 90 }, DEFAULT_RULES, ctx({ pastAmountsToPayee: [17.99, 17.99, 17.99] }));
    assert.ok(codes(r).includes("unusual_amount"));
  });
});

describe("agent keys", () => {
  it("allow within the allowance and deny past it", () => {
    assert.equal(evaluate({ payee: "Netflix", amount: 50 }, DEFAULT_RULES, ctx(), agent({ usedThisMonth: 100 })).decision, "allow");
    const over = evaluate({ payee: "Netflix", amount: 150 }, DEFAULT_RULES, ctx(), agent({ usedThisMonth: 100 }));
    assert.equal(over.decision, "deny");
    assert.ok(codes(over).includes("allowance_exceeded"));
  });

  it("deny outside the key's categories, per-payment cap, or after revoking", () => {
    assert.ok(codes(evaluate({ payee: "Netflix", amount: 10, category: "shopping" }, DEFAULT_RULES, ctx(), agent({ categories: ["bills"] }))).includes("agent_category"));
    assert.ok(codes(evaluate({ payee: "Netflix", amount: 10 }, DEFAULT_RULES, ctx(), agent({ categories: ["bills"] }))).includes("agent_category"));
    assert.equal(evaluate({ payee: "Netflix", amount: 60 }, DEFAULT_RULES, ctx(), agent({ maxPerPayment: 50 })).decision, "deny");
    assert.equal(evaluate({ payee: "Netflix", amount: 5 }, DEFAULT_RULES, ctx(), agent({ revoked: true })).decision, "deny");
    assert.equal(evaluate({ payee: "Netflix", amount: 5 }, DEFAULT_RULES, ctx(), agent({ expired: true })).decision, "deny");
  });

  it("deny high-risk payments outright, where a person would only be asked", () => {
    const real = ctx().knownAddresses[0];
    const fake = real.slice(0, 6) + "0".repeat(real.length - 10) + real.slice(-4);
    const req = { payee: "Landlord Okafor", amount: 50, payeeAddress: fake };
    assert.equal(evaluate(req, DEFAULT_RULES, ctx()).decision, "needs_approval");
    assert.equal(evaluate(req, DEFAULT_RULES, ctx(), agent()).decision, "deny");
  });
});

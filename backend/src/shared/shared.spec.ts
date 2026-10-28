import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_IDS, CATEGORY_LABELS, guessCategory, merchantKey } from "./categories.js";
import { categoryRuleSentence, goalSentence, limitSentence, paydaySentence } from "./memory-text.js";

describe("merchantKey", () => {
  it("drops numbers, card noise and company suffixes", () => {
    assert.equal(merchantKey("AMAZON MKTPLACE *1234#"), "amazon");
    assert.equal(merchantKey("POS PURCHASE Shoprite Lekki #0042"), "shoprite lekki");
    assert.equal(merchantKey("Spectranet Ltd"), "spectranet");
  });

  it("keeps at most two words so variants share one rule", () => {
    assert.equal(merchantKey("Bolt Ride Lagos Island Trip"), "bolt ride");
  });

  it("returns an empty key when nothing meaningful is left", () => {
    assert.equal(merchantKey("12345 #"), "");
  });
});

describe("guessCategory", () => {
  it("treats pay-like credits as income", () => {
    assert.equal(guessCategory("Toptal invoice", 1180), "income");
    assert.equal(guessCategory("Refund from store", 20), "income");
  });

  it("matches known merchants by keyword", () => {
    assert.equal(guessCategory("Bolt trip", -5), "transport");
    assert.equal(guessCategory("Netflix", -17.99), "entertainment");
    assert.equal(guessCategory("MTN airtime", -10), "bills");
    assert.equal(guessCategory("MedPlus pharmacy", -9.6), "health");
    assert.equal(guessCategory("Jumia order", -40), "shopping");
    assert.equal(guessCategory("KFC Lekki", -12), "food");
  });

  it("falls back to uncategorized for unknown spending and income for unknown credits", () => {
    assert.equal(guessCategory("Mystery Co", -10), "uncategorized");
    assert.equal(guessCategory("Mystery Co", 10), "income");
  });

  it("has a label for every category", () => {
    for (const id of CATEGORY_IDS) assert.ok(CATEGORY_LABELS[id]);
  });
});

describe("memory sentences", () => {
  it("words a goal like the onboarding preview", () => {
    assert.equal(goalSentence({ name: " Laptop ", target: 1200, due: "2027-01-31" }), "You're saving for laptop, $1,200 by January.");
  });

  it("words a spending limit", () => {
    assert.equal(limitSentence({ category: "entertainment", amount: 100 }), "Keep entertainment under $100 a month.");
  });

  it("words payday with the right ordinal", () => {
    assert.equal(paydaySentence(1), "You're paid on the 1st, so a low balance the week before is normal.");
    assert.equal(paydaySentence(22), "You're paid on the 22nd, so a low balance the week before is normal.");
    assert.equal(paydaySentence(13), "You're paid on the 13th, so a low balance the week before is normal.");
    assert.equal(paydaySentence("irregular"), "Your income is irregular, so plan from your lowest recent month.");
  });

  it("words a learned category rule", () => {
    assert.equal(categoryRuleSentence("Amazon", "business"), "Amazon transactions are business supplies.");
  });
});

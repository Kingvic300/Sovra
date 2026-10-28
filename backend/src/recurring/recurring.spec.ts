import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectRecurring } from "./recurring.module.js";

type Row = Parameters<typeof detectRecurring>[0][number];

const charge = (date: string, amount: number, merchant = "Netflix", category = "entertainment"): Row => ({
  date,
  merchant,
  merchantKey: merchant.toLowerCase(),
  category,
  amount,
});

describe("detectRecurring", () => {
  it("finds a monthly charge and predicts the next date from the typical gap", () => {
    const found = detectRecurring([charge("2026-07-30", -17.99), charge("2026-08-30", -17.99), charge("2026-09-30", -17.99)]);
    assert.equal(found.length, 1);
    assert.deepEqual(found[0], {
      merchant: "Netflix",
      merchantKey: "netflix",
      category: "entertainment",
      amount: 17.99,
      cadence: "monthly",
      occurrences: 3,
      lastDate: "2026-09-30",
      nextDate: "2026-10-31",
    });
  });

  it("finds a weekly charge", () => {
    const found = detectRecurring([charge("2026-10-01", -5, "Bolt"), charge("2026-10-08", -5, "Bolt"), charge("2026-10-15", -5, "Bolt")]);
    assert.equal(found[0].cadence, "weekly");
    assert.equal(found[0].nextDate, "2026-10-22");
  });

  it("uses the median amount and tolerates small price changes", () => {
    const found = detectRecurring([charge("2026-07-01", -10), charge("2026-08-01", -10.5), charge("2026-09-01", -11)]);
    assert.equal(found[0].amount, 10.5);
  });

  it("ignores merchants whose amounts vary more than 15%", () => {
    assert.deepEqual(detectRecurring([charge("2026-07-01", -10), charge("2026-08-01", -20), charge("2026-09-01", -10)]), []);
  });

  it("ignores irregular gaps", () => {
    assert.deepEqual(detectRecurring([charge("2026-07-01", -10), charge("2026-07-15", -10), charge("2026-09-01", -10)]), []);
  });

  it("needs at least two charges", () => {
    assert.deepEqual(detectRecurring([charge("2026-07-01", -10)]), []);
  });

  it("ignores money coming in", () => {
    assert.deepEqual(
      detectRecurring([charge("2026-07-25", 1800, "Payroll", "income"), charge("2026-08-25", 1800, "Payroll", "income")]),
      [],
    );
  });

  it("groups by merchant key and sorts by next date", () => {
    const found = detectRecurring([
      charge("2026-08-20", -30, "Gym"),
      charge("2026-09-20", -30, "Gym"),
      charge("2026-08-05", -10, "Spotify"),
      charge("2026-09-05", -10, "Spotify"),
    ]);
    assert.deepEqual(
      found.map((r) => r.merchant),
      ["Spotify", "Gym"],
    );
  });

  it("does not depend on input order", () => {
    const rows = [charge("2026-09-30", -17.99), charge("2026-07-30", -17.99), charge("2026-08-30", -17.99)];
    assert.equal(detectRecurring(rows)[0].lastDate, "2026-09-30");
  });
});

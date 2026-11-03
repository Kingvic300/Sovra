import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthlyCashflow } from "./ask.service.js";

describe("monthlyCashflow", () => {
  const acc = new Map([["ngn", "NGN"], ["usd", "USD"]]);
  const rows = [
    { date: "2026-08-01", amount: 1000, accountId: "ngn" },
    { date: "2026-09-01", amount: 1000, accountId: "ngn" },
    { date: "2026-09-10", amount: -400, accountId: "ngn" },
    { date: "2026-10-01", amount: 1000, accountId: "ngn" },
    { date: "2026-10-05", amount: -1200.5, accountId: "ngn" },
    { date: "2026-10-06", amount: -50, accountId: "usd" },
    { date: "2026-11-02", amount: -30, accountId: "ngn" },
    { date: "2026-07-01", amount: 999, accountId: "ngn" },
  ];

  it("uses the last three full months in the user's currency", () => {
    const flow = monthlyCashflow(rows, acc, "NGN", "2026-11");
    assert.deepEqual(flow.map((f) => f.month), ["2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(flow[2], { month: "2026-10", income: 1000, spent: 1200.5, net: -200.5 });
  });

  it("falls back to the current month, marked partial", () => {
    const flow = monthlyCashflow([{ date: "2026-11-02", amount: -30, accountId: "ngn" }], acc, "NGN", "2026-11");
    assert.deepEqual(flow, [{ month: "2026-11", income: 0, spent: 30, net: -30, partial: true }]);
  });
});

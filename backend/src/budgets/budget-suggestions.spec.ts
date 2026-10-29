import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastFullMonths, suggestBudgets, type SuggestionInput } from "./budget-suggestions.js";

const MONTHS = ["2026-07", "2026-08", "2026-09"];

const input = (limit: number, spent: number[], extra: Partial<SuggestionInput> = {}): SuggestionInput => ({
  limits: [{ category: "transport", limit }],
  months: MONTHS,
  spent: new Map([["transport", spent]]),
  projected: new Map(),
  suppressed: new Set(),
  ...extra,
});

describe("suggestBudgets", () => {
  it("suggests raising a limit the user goes over in 2 of 3 months, to the median month rounded up", () => {
    const [s] = suggestBudgets(input(150, [160, 175, 125]));
    assert.deepEqual(
      { id: s.id, direction: s.direction, from: s.from, to: s.to },
      { id: "transport:raise:160", direction: "raise", from: 150, to: 160 },
    );
    assert.equal(
      s.text,
      "You went over your $150 transport limit in 2 of the last 3 months, with a typical month at $160. A $160 limit matches what you actually spend.",
    );
    assert.deepEqual(s.evidence, [
      { month: "2026-07", spent: 160 },
      { month: "2026-08", spent: 175 },
      { month: "2026-09", spent: 125 },
    ]);
  });

  it("counts exactly 80% as consistently used, but not less", () => {
    assert.equal(suggestBudgets(input(150, [160, 175, 120])).length, 1);
    assert.equal(suggestBudgets(input(150, [160, 175, 119.99])).length, 0);
  });

  it("doesn't raise for a single bad month", () => {
    assert.deepEqual(suggestBudgets(input(150, [200, 140, 130])), []);
  });

  it("suggests lowering a limit used under 60% for 3 months, with 20% headroom", () => {
    const [s] = suggestBudgets(input(150, [64, 50, 70]));
    assert.equal(s.id, "transport:lower:90");
    assert.equal(s.to, 90);
    assert.equal(s.text, "You've used under 60% of your $150 transport limit for 3 months running, $70 at most. Lowering it to $90 frees $60 a month.");
  });

  it("doesn't lower at exactly 60%, or when this month's projection wouldn't fit", () => {
    assert.deepEqual(suggestBudgets(input(150, [90, 50, 70])), []);
    assert.deepEqual(suggestBudgets(input(150, [64, 50, 70], { projected: new Map([["transport", 95]]) })), []);
    assert.equal(suggestBudgets(input(150, [64, 50, 70], { projected: new Map([["transport", 90]]) })).length, 1);
  });

  it("never suggests anything for a category with no spending", () => {
    assert.deepEqual(suggestBudgets(input(150, [0, 0, 0])), []);
    assert.deepEqual(suggestBudgets({ ...input(150, []), spent: new Map() }), []);
  });

  it("never lowers below $10", () => {
    assert.equal(suggestBudgets(input(100, [1, 2, 3]))[0].to, 10);
  });

  it("leaves out suggestions the user dismissed", () => {
    assert.deepEqual(suggestBudgets(input(150, [160, 175, 125], { suppressed: new Set(["transport:raise"]) })), []);
    assert.equal(suggestBudgets(input(150, [160, 175, 125], { suppressed: new Set(["transport:lower"]) })).length, 1);
  });

  it("is deterministic and lists raises first", () => {
    const data: SuggestionInput = {
      limits: [
        { category: "shopping", limit: 150 },
        { category: "transport", limit: 150 },
        { category: "food", limit: 300 },
      ],
      months: MONTHS,
      spent: new Map([
        ["shopping", [64, 50, 70]],
        ["transport", [160, 175, 125]],
        ["food", [100, 120, 90]],
      ]),
      projected: new Map(),
      suppressed: new Set(),
    };
    const ids = suggestBudgets(data).map((s) => s.id);
    assert.deepEqual(ids, ["transport:raise:160", "food:lower:150", "shopping:lower:90"]);
    assert.deepEqual(suggestBudgets(data), suggestBudgets(data));
  });
});

describe("lastFullMonths", () => {
  it("returns the three months before the current one, across a year boundary", () => {
    assert.deepEqual(lastFullMonths(new Date("2026-01-15T10:00:00Z")), ["2025-10", "2025-11", "2025-12"]);
    assert.deepEqual(lastFullMonths(new Date("2026-10-31T23:59:59Z")), ["2026-07", "2026-08", "2026-09"]);
  });
});

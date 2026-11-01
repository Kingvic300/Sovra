import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPicks, candidatesFor, outcome, rulePlan, type CutCandidate, type CutTarget, type HabitRow } from "./cut-plan.js";

const visits = (merchant: string, key: string, dates: string[], amount: number, category = "food"): HabitRow[] =>
  dates.map((date) => ({ date, merchant, merchantKey: key, category, amount: -amount }));

describe("candidatesFor", () => {
  const base = { category: "food", today: "2026-06-10", monthEnd: "2026-06-30", recurringKeys: new Set<string>() };

  it("offers each renewal still due once, adding up weekly ones", () => {
    const out = candidatesFor({
      ...base,
      renewals: [
        { id: "gym", merchant: "Gym", amount: 10, date: "2026-06-14" },
        { id: "gym", merchant: "Gym", amount: 10, date: "2026-06-21" },
        { id: "box", merchant: "Veg box", amount: 25.5, date: "2026-06-12" },
      ],
      habits: [],
    });
    assert.deepEqual(out, [
      { id: "pause:gym", kind: "pause", category: "food", recurringId: "gym", merchant: "Gym", saving: 20, nextDate: "2026-06-14" },
      { id: "pause:box", kind: "pause", category: "food", recurringId: "box", merchant: "Veg box", saving: 25.5, nextDate: "2026-06-12" },
    ]);
  });

  it("turns regular merchants into skips sized by how often the user goes", () => {
    // 9 visits in 90 days is one every 10 days: about 2 more in the 21 days left.
    const dates = ["2026-03-20", "2026-03-30", "2026-04-09", "2026-04-19", "2026-04-29", "2026-05-09", "2026-05-19", "2026-06-01", "2026-06-08"];
    const [skip] = candidatesFor({ ...base, renewals: [], habits: visits("Chicken Republic", "chicken republic", dates, 12) });
    assert.deepEqual(skip, {
      id: "skip:chicken republic",
      kind: "skip",
      category: "food",
      merchant: "Chicken Republic",
      perVisit: 12,
      maxSkips: 2,
      visitsThisMonth: 2,
      spentThisMonth: 24,
    });
  });

  it("leaves out one-off spending, recurring merchants and habits unlikely to come up again this month", () => {
    const out = candidatesFor({
      ...base,
      today: "2026-06-30",
      renewals: [],
      habits: [
        ...visits("Once", "once", ["2026-06-02"], 300),
        ...visits("Netflix", "netflix", ["2026-04-15", "2026-05-15"], 15),
        ...visits("Rare", "rare", ["2026-04-01", "2026-05-01"], 40),
      ],
      recurringKeys: new Set(["netflix"]),
    });
    assert.deepEqual(out, []);
  });
});

const pause = (id: string, saving: number, merchant = id, category = "entertainment"): CutCandidate => ({
  id: `pause:${id}`,
  kind: "pause",
  category,
  merchant,
  recurringId: id,
  saving,
  nextDate: "2026-06-15",
});
const skip = (key: string, perVisit: number, maxSkips: number, merchant = key, category = "entertainment"): CutCandidate => ({
  id: `skip:${key}`,
  kind: "skip",
  category,
  merchant,
  perVisit,
  maxSkips,
  visitsThisMonth: 2,
  spentThisMonth: perVisit * 2,
});

describe("applyPicks", () => {
  const candidates = [pause("netflix", 15.99, "Netflix"), skip("filmhouse", 30, 2, "Filmhouse")];

  it("recomputes savings from the candidates and holds skips to their limit", () => {
    const cuts = applyPicks(
      candidates,
      [
        { id: "skip:filmhouse", visits: 99, why: "Fewer films." },
        { id: "pause:netflix", visits: 4, why: "  Netflix renews soon.  " },
      ],
      [],
    );
    assert.deepEqual(
      cuts.map(({ id, visits, saving, why }) => ({ id, visits, saving, why })),
      [
        { id: "skip:filmhouse", visits: 2, saving: 60, why: "Fewer films." },
        { id: "pause:netflix", visits: null, saving: 15.99, why: "Netflix renews soon." },
      ],
    );
  });

  it("drops ids the model made up and repeats, and keeps only real memories", () => {
    const cuts = applyPicks(
      candidates,
      [
        { id: "pause:spotify", why: "Not a candidate." },
        { id: "pause:netflix", why: "Once.", memory: "I said I'd watch less TV." },
        { id: "pause:netflix", why: "Twice." },
        { id: "skip:filmhouse", visits: 0, why: "At least one.", memory: "Made-up memory" },
      ],
      ["I said I'd watch less TV."],
    );
    assert.deepEqual(
      cuts.map(({ id, visits, memory }) => ({ id, visits, memory })),
      [
        { id: "pause:netflix", visits: null, memory: "I said I'd watch less TV." },
        { id: "skip:filmhouse", visits: 1, memory: null },
      ],
    );
  });
});

describe("rulePlan", () => {
  const target: CutTarget = { category: "entertainment", label: "Entertainment", limit: 100, projected: 140, over: 40 };

  it("pauses the biggest renewals first, then skips visits, and stops once the gap is closed", () => {
    const { picks } = rulePlan([target], [skip("filmhouse", 30, 3), pause("spotify", 10), pause("netflix", 16)], [], "USD");
    assert.deepEqual(
      picks.map((p) => [p.id, p.visits ?? null]),
      [
        ["pause:netflix", null],
        ["pause:spotify", null],
        ["skip:filmhouse", 1],
      ],
    );
  });

  it("keeps anything a memory mentions", () => {
    const transport: CutTarget = { category: "transport", label: "Transport", limit: 40, projected: 90, over: 50 };
    const memory = "Late Bolt rides home count as safety for me.";
    const { picks, kept } = rulePlan([transport], [skip("bolt", 25, 2, "Bolt", "transport")], [memory], "USD");
    assert.deepEqual(picks, []);
    assert.deepEqual(kept, [{ id: "skip:bolt", why: `You told Sovra: "${memory}"` }]);
  });
});

describe("outcome", () => {
  it("says where each category ends and whether the cuts are enough", () => {
    const targets: CutTarget[] = [
      { category: "entertainment", label: "Entertainment", limit: 100, projected: 120, over: 20 },
      { category: "food", label: "Food", limit: 200, projected: 260, over: 60 },
    ];
    const cuts = applyPicks(
      [pause("netflix", 25), skip("kfc", 10, 3, "KFC", "food")],
      [
        { id: "pause:netflix", why: "" },
        { id: "skip:kfc", visits: 3, why: "" },
      ],
      [],
    );
    assert.deepEqual(outcome(targets, cuts), {
      targets: [
        { category: "entertainment", label: "Entertainment", limit: 100, projected: 120, after: 95 },
        { category: "food", label: "Food", limit: 200, projected: 260, after: 230 },
      ],
      totalSaving: 55,
      closesGap: false,
    });
  });
});

import { formatMoney } from "../shared/currency.js";

/**
 * What Sovra could cut to bring an over-budget category back under its limit. Candidates come only
 * from the user's own data, and every amount is computed here: the AI model only chooses among them
 * and explains why, so it can't invent a saving.
 */

const DAY = 86_400_000;
/** Visits to one merchant a plan may ask the user to skip in a month. */
export const MAX_SKIPS = 8;
/** How far back spending habits are read. */
export const HABIT_DAYS = 90;

const cents = (n: number) => Math.round(n * 100) / 100;

export type CutTarget = {
  category: string;
  label: string;
  limit: number;
  projected: number;
  over: number;
  /** The month's biggest merchants in the category so far: what to cut back on next month when this one is mostly spent. */
  biggestThisMonth?: { merchant: string; spent: number; times: number }[];
};

/** The `count` merchants the user spent most with this month, from money-out rows. */
export function biggestThisMonth(rows: HabitRow[], month: string, count = 5) {
  const totals = new Map<string, { merchant: string; spent: number; times: number }>();
  for (const r of rows) {
    if (!r.date.startsWith(month)) continue;
    const t = totals.get(r.merchantKey) ?? { merchant: r.merchant, spent: 0, times: 0 };
    t.spent = cents(t.spent - r.amount);
    t.times++;
    totals.set(r.merchantKey, t);
  }
  return [...totals.values()].sort((a, b) => b.spent - a.spent).slice(0, count);
}

export type CutCandidate =
  | {
      /** `pause:<recurring id>` */
      id: string;
      kind: "pause";
      category: string;
      merchant: string;
      recurringId: string;
      /** The renewal amount still due this month (all of them, for weekly charges). */
      saving: number;
      nextDate: string;
    }
  | {
      /** `skip:<merchant key>` */
      id: string;
      kind: "skip";
      category: string;
      merchant: string;
      /** Average amount per visit over the habit window. */
      perVisit: number;
      /** Visits likely before the month ends, from how often the user goes. At most MAX_SKIPS. */
      maxSkips: number;
      visitsThisMonth: number;
      spentThisMonth: number;
    };

export type HabitRow = { date: string; merchant: string; merchantKey: string; category: string; amount: number };
export type Renewal = { id: string; merchant: string; amount: number; date: string };

/**
 * Candidates for one category: each active renewal still due this month, and each merchant the
 * user spent at at least twice in the last HABIT_DAYS days and will likely visit again this month.
 * Merchants that are recurring charges are left out of habits: pausing covers them.
 */
export function candidatesFor(input: {
  category: string;
  today: string;
  monthEnd: string;
  renewals: Renewal[];
  /** Money-out rows in this category from the last HABIT_DAYS days, amounts negative, in the user's currency. */
  habits: HabitRow[];
  recurringKeys: Set<string>;
}): CutCandidate[] {
  const out: CutCandidate[] = [];
  const byRenewal = new Map<string, { merchant: string; saving: number; nextDate: string }>();
  for (const r of input.renewals) {
    const seen = byRenewal.get(r.id);
    if (seen) seen.saving = cents(seen.saving + r.amount);
    else byRenewal.set(r.id, { merchant: r.merchant, saving: cents(r.amount), nextDate: r.date });
  }
  for (const [recurringId, r] of byRenewal) {
    out.push({ id: `pause:${recurringId}`, kind: "pause", category: input.category, recurringId, ...r });
  }

  const daysLeft = Math.max(0, Math.round((Date.parse(input.monthEnd) - Date.parse(input.today)) / DAY) + 1);
  const month = input.today.slice(0, 7);
  const groups = new Map<string, HabitRow[]>();
  for (const row of input.habits) {
    if (input.recurringKeys.has(row.merchantKey)) continue;
    const list = groups.get(row.merchantKey) ?? [];
    list.push(row);
    groups.set(row.merchantKey, list);
  }
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const total = rows.reduce((s, r) => s - r.amount, 0);
    const perVisit = cents(total / rows.length);
    const expected = Math.round((rows.length / HABIT_DAYS) * daysLeft);
    if (expected < 1 || perVisit <= 0) continue;
    const thisMonth = rows.filter((r) => r.date.startsWith(month));
    out.push({
      id: `skip:${key}`,
      kind: "skip",
      category: input.category,
      merchant: rows.at(-1)!.merchant,
      perVisit,
      maxSkips: Math.min(MAX_SKIPS, expected),
      visitsThisMonth: thisMonth.length,
      spentThisMonth: cents(thisMonth.reduce((s, r) => s - r.amount, 0)),
    });
  }
  return out;
}

export type CutPick = { id: string; visits?: number | null; why: string; memory?: string | null };
export type KeptPick = { id: string; why: string };

export type Cut = {
  id: string;
  kind: "pause" | "skip";
  category: string;
  merchant: string;
  recurringId: string | null;
  visits: number | null;
  perVisit: number | null;
  saving: number;
  why: string;
  /** The memory this cut takes into account, word for word. */
  memory: string | null;
};

/**
 * Turns the model's picks into cuts: unknown ids and repeats are dropped, skips are held to the
 * candidate's limit, and every saving is recomputed from the candidate. Memories it quotes must be real.
 */
export function applyPicks(candidates: CutCandidate[], picks: CutPick[], memories: string[]): Cut[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const known = new Set(memories);
  const used = new Set<string>();
  const cuts: Cut[] = [];
  for (const p of picks) {
    const c = byId.get(p.id);
    if (!c || used.has(c.id)) continue;
    used.add(c.id);
    const memory = p.memory && known.has(p.memory) ? p.memory : null;
    const why = p.why.trim().slice(0, 300);
    if (c.kind === "pause") {
      cuts.push({ ...base(c), recurringId: c.recurringId, visits: null, perVisit: null, saving: c.saving, why, memory });
    } else {
      const visits = Math.min(c.maxSkips, Math.max(1, Math.round(p.visits ?? 1)));
      cuts.push({ ...base(c), recurringId: null, visits, perVisit: c.perVisit, saving: cents(visits * c.perVisit), why, memory });
    }
  }
  return cuts;
}

const base = (c: CutCandidate) => ({ id: c.id, kind: c.kind, category: c.category, merchant: c.merchant });

/**
 * The plan without an AI model: per category, pause renewals biggest first, then skip visits at the
 * priciest habits, until the category is back under its limit. Merchants a memory mentions are kept.
 */
export function rulePlan(targets: CutTarget[], candidates: CutCandidate[], memories: string[], currency: string) {
  const mentioned = (merchant: string) => memories.find((m) => m.toLowerCase().includes(merchant.toLowerCase())) ?? null;
  const picks: CutPick[] = [];
  const kept: KeptPick[] = [];
  for (const t of targets) {
    let gap = t.over;
    const mine = candidates
      .filter((c) => c.category === t.category)
      .sort((a, b) => (a.kind === b.kind ? weight(b) - weight(a) : a.kind === "pause" ? -1 : 1));
    for (const c of mine) {
      if (gap <= 0) break;
      const memory = mentioned(c.merchant);
      if (memory) {
        kept.push({ id: c.id, why: `You told Sovra: "${memory}"` });
        continue;
      }
      if (c.kind === "pause") {
        picks.push({ id: c.id, why: `${formatMoney(c.saving, currency)} renewal still due this month.` });
        gap -= c.saving;
      } else {
        const visits = Math.min(c.maxSkips, Math.ceil(gap / c.perVisit));
        picks.push({ id: c.id, visits, why: `About ${formatMoney(c.perVisit, currency)} a visit, and you usually go again before the month ends.` });
        gap -= visits * c.perVisit;
      }
    }
  }
  return { picks, kept };
}

const weight = (c: CutCandidate) => (c.kind === "pause" ? c.saving : c.perVisit * c.maxSkips);

/** Where each target ends the month if the user makes every cut. */
export function outcome(targets: CutTarget[], cuts: Cut[]) {
  const after = targets.map((t) => {
    const saved = cuts.filter((c) => c.category === t.category).reduce((s, c) => s + c.saving, 0);
    return { category: t.category, label: t.label, limit: t.limit, projected: t.projected, after: cents(t.projected - saved) };
  });
  return {
    targets: after,
    totalSaving: cents(cuts.reduce((s, c) => s + c.saving, 0)),
    closesGap: after.every((t) => t.after <= t.limit),
  };
}

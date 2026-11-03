import type { Goal, Transaction } from "@/lib/demo-data";

/** Money in and out for one calendar month, from imported transactions. */
export type MonthFlow = { month: string; income: number; spent: number; net: number };

export type GoalForecast = {
  goalId: string;
  remaining: number;
  /** What the goal needs each month from today to land on its due date. */
  neededPerMonth: number;
  /** Months left until the due date, at least 1. */
  monthsLeft: number;
  /** When the goal is reached if savings fill goals in due-date order, or null when nothing is left over. */
  reachBy: string | null;
  /** Whether the estimate covers this goal plus every goal due before it. */
  onTrack: boolean;
  /** Extra per month needed to get back on track (0 when on track). */
  shortBy: number;
};

export type SavingsForecast =
  | { status: "no_statement" }
  | {
      status: "ready";
      /** Months the estimate is based on, newest last. */
      months: MonthFlow[];
      /** True when only the current, unfinished month has data. */
      partial: boolean;
      avgIncome: number;
      avgSpent: number;
      /** Average income minus spending per month. Negative means spending more than comes in. */
      avgNet: number;
      /** The part of avgNet that can go to goals (never below 0). */
      monthlyCapacity: number;
      /** Net saved across the months used. */
      totalNet: number;
      goals: GoalForecast[];
    };

const MAX_MONTHS = 3;

function monthsBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td - fd) / 30;
}

function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(months * 30.44));
  return d.toISOString().slice(0, 10);
}

/**
 * Estimates what the user saves each month from their own statement: income minus spending in the
 * last full months (up to three), and what that means for each goal. Without imported transactions
 * there is nothing to estimate from, so it says so instead of guessing.
 */
export function forecastSavings(transactions: Transaction[], goals: Goal[], today: string): SavingsForecast {
  if (!transactions.length) return { status: "no_statement" };

  const byMonth = new Map<string, MonthFlow>();
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    const flow = byMonth.get(month) ?? { month, income: 0, spent: 0, net: 0 };
    if (t.amount >= 0) flow.income += t.amount;
    else flow.spent += -t.amount;
    flow.net = flow.income - flow.spent;
    byMonth.set(month, flow);
  }

  const thisMonth = today.slice(0, 7);
  const full = [...byMonth.values()].filter((f) => f.month < thisMonth).sort((a, b) => a.month.localeCompare(b.month));
  const partial = full.length === 0;
  const months = partial ? [...byMonth.values()].filter((f) => f.month === thisMonth) : full.slice(-MAX_MONTHS);
  if (!months.length) return { status: "no_statement" };

  const avg = (pick: (f: MonthFlow) => number) => months.reduce((s, f) => s + pick(f), 0) / months.length;
  const avgIncome = avg((f) => f.income);
  const avgSpent = avg((f) => f.spent);
  const avgNet = avgIncome - avgSpent;
  const monthlyCapacity = Math.max(0, avgNet);

  // Goals due first get the savings first.
  let committed = 0;
  // Savings fill goals one after another, so a later goal starts once the earlier ones are funded.
  let queued = 0;
  const forecasts = [...goals]
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((g): GoalForecast => {
      const remaining = Math.max(0, g.target - g.saved);
      const monthsLeft = Math.max(1, monthsBetween(today, g.due));
      const neededPerMonth = remaining / monthsLeft;
      committed += neededPerMonth;
      queued += remaining;
      const onTrack = remaining === 0 || monthlyCapacity >= committed;
      return {
        goalId: g.id,
        remaining,
        neededPerMonth,
        monthsLeft,
        reachBy: remaining === 0 ? today : monthlyCapacity > 0 ? addMonths(today, queued / monthlyCapacity) : null,
        onTrack,
        shortBy: onTrack ? 0 : committed - monthlyCapacity,
      };
    });

  return {
    status: "ready",
    months,
    partial,
    avgIncome,
    avgSpent,
    avgNet,
    monthlyCapacity,
    totalNet: months.reduce((s, f) => s + f.net, 0),
    goals: forecasts,
  };
}

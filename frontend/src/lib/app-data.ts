import { createContext, useContext } from "react";
import {
  ACCOUNTS,
  BUDGETS,
  MEMORIES,
  MEMORY_COUNT,
  MONTH_NET,
  PAYDAY,
  RECURRING,
  TODAY,
  TRANSACTIONS,
  type Budget,
  type CategoryId,
  type Memory,
  type MemoryKind,
  type Recurring,
} from "@/lib/demo-data";
import { daysBetween, longDate } from "@/lib/format";

/** Everything the user can change from the UI. Persisted in the browser until the backend is wired. */
export type AppData = {
  budgets: Budget[];
  recurring: Recurring[];
  memories: Memory[];
  /** Insights the user already answered, so they aren't asked again. */
  answered: string[];
};

export const INITIAL_DATA: AppData = {
  budgets: BUDGETS,
  recurring: RECURRING,
  memories: MEMORIES,
  answered: [],
};

export type NewMemory = { kind: MemoryKind; text: string; highlight: string; source: string };

export type AppDataApi = {
  data: AppData;
  addMemory: (m: NewMemory) => string;
  removeMemory: (id: string) => void;
  restoreMemory: (m: Memory, index: number) => void;
  setRecurringStatus: (id: string, status: Recurring["status"]) => void;
  upsertBudget: (b: Budget) => void;
  markAnswered: (insightId: string, answered: boolean) => void;
  reset: () => void;
};

export const AppDataContext = createContext<AppDataApi | null>(null);

export function useAppData() {
  const api = useContext(AppDataContext);
  if (!api) throw new Error("useAppData must be used inside <AppDataProvider>");
  return api;
}

export const MONTH_END = "2026-10-31";

/** Renewals in a category that are still due before the month ends. */
export function committedFor(category: CategoryId, recurring: Recurring[]) {
  const due = recurring.filter(
    (r) => r.status === "active" && r.category === category && r.next >= TODAY && r.next <= MONTH_END,
  );
  const amount = due.reduce((s, r) => s + r.amount, 0);
  if (!due.length) return { amount: 0, label: null as string | null, items: due };
  const names = due.map((r) => r.merchant);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const sameDay = due.every((r) => r.next === due[0].next);
  const when = sameDay ? `on ${longDate(due[0].next).split(",")[0]}` : "before the month ends";
  return { amount, label: `${list} ${when}`, items: due };
}

export type BudgetView = Budget & {
  committed: number;
  committedLabel: string | null;
  projected: number;
  left: number;
  over: boolean;
};

export function budgetViews(data: AppData): BudgetView[] {
  return data.budgets.map((b) => {
    const c = committedFor(b.category, data.recurring);
    const projected = b.spent + c.amount;
    return { ...b, committed: c.amount, committedLabel: c.label, projected, left: b.limit - projected, over: projected > b.limit };
  });
}

/** What the user has spent in a category this month, from imported transactions. */
export function spentThisMonth(category: CategoryId) {
  const month = TODAY.slice(0, 7);
  return TRANSACTIONS.filter((t) => t.category === category && t.amount < 0 && t.date.startsWith(month)).reduce(
    (s, t) => s + -t.amount,
    0,
  );
}

/** Older memories that exist on Walrus but aren't in the demo list. */
const OLDER_MEMORIES = MEMORY_COUNT - MEMORIES.length;

export function memoryCount(data: AppData) {
  return OLDER_MEMORIES + data.memories.length;
}

/**
 * Money free until payday. Starts from the demo figure and adjusts for
 * renewals the user paused or resumed that would land before payday.
 */
export function freeUntilPayday(data: AppData) {
  let free = MONTH_NET;
  for (const r of data.recurring) {
    const initial = RECURRING.find((x) => x.id === r.id);
    if (!initial || initial.status === r.status || r.next > PAYDAY) continue;
    free += r.status === "paused" ? r.amount : -r.amount;
  }
  return free;
}

export function shellStats(data: AppData) {
  const wallet = ACCOUNTS.find((a) => a.source === "tatum");
  return {
    transactions: TRANSACTIONS.length,
    budgetsOver: budgetViews(data).filter((b) => b.over).length,
    dueSoon: data.recurring.filter((r) => r.status === "active" && daysBetween(TODAY, r.next) <= 3).length,
    memories: memoryCount(data),
    freeUntilPayday: freeUntilPayday(data),
    daysToPayday: daysBetween(TODAY, PAYDAY),
    walletSyncedToday: wallet?.syncedAt === TODAY,
  };
}

export type ShellStats = ReturnType<typeof shellStats>;

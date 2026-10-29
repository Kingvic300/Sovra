import { createContext, useContext } from "react";
import {
  ACCOUNTS,
  BALANCE_HISTORY,
  BUDGETS,
  CHAT,
  GOALS,
  MEMORIES,
  MEMORY_COUNT,
  MONTH_NET,
  PAYDAY,
  RECURRING,
  TODAY,
  TRANSACTIONS,
  type Account,
  type Budget,
  type CategoryId,
  type ChatMessage,
  type Goal,
  type Memory,
  type MemoryKind,
  type Recurring,
  type Transaction,
} from "@/lib/demo-data";
import { daysBetween, longDate } from "@/lib/format";

/**
 * - "sample": the demo account without a backend: the demo story, with changes saved in the browser.
 * - "loading": the backend session is being checked or the user's data is loading.
 * - "live": everything comes from, and is saved to, the backend.
 * - "offline": a real account whose data couldn't be loaded. Screens are empty; sample data is never shown.
 */
export type DataSource = "sample" | "loading" | "live" | "offline";

export type AppData = {
  source: DataSource;
  /** ISO dates every screen measures from. Fixed for the sample story, the real date when live. */
  today: string;
  monthEnd: string;
  payday: string;
  budgets: Budget[];
  goals: Goal[];
  recurring: Recurring[];
  memories: Memory[];
  /** Memories stored on Walrus but not in the list (sample data only). */
  hiddenMemories: number;
  transactions: Transaction[];
  accounts: Account[];
  /** Known balances plus the wallet. Null when no balance is known. */
  total: number | null;
  /** Daily total for the last 30 days, oldest first. */
  balanceHistory: number[];
  /** Money left until payday, as counted with each renewal at its `baseStatus`. */
  monthNet: number;
  chat: ChatMessage[];
  /** Insights the user already answered, so they aren't asked again. */
  answered: string[];
};

/** Last day of the month that `iso` falls in. */
export function monthEndOf(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const SAMPLE_DATA: AppData = {
  source: "sample",
  today: TODAY,
  monthEnd: monthEndOf(TODAY),
  payday: PAYDAY,
  budgets: BUDGETS,
  goals: GOALS,
  recurring: RECURRING,
  memories: MEMORIES,
  hiddenMemories: MEMORY_COUNT - MEMORIES.length,
  transactions: TRANSACTIONS,
  accounts: ACCOUNTS,
  total: ACCOUNTS.reduce((sum, a) => sum + (a.balance ?? 0), 0),
  balanceHistory: BALANCE_HISTORY,
  monthNet: MONTH_NET,
  chat: CHAT,
  answered: [],
};

/** Whether a memory the server writes for an action was stored. "skipped" means Walrus Memory isn't set up. */
export type MemoryOutcome = "saved" | "skipped" | "failed";

/** Nothing to show: a real account before its data loads or when the backend can't be reached. */
export function emptyData(today: string): AppData {
  return {
    source: "offline",
    today,
    monthEnd: monthEndOf(today),
    payday: monthEndOf(today),
    budgets: [],
    goals: [],
    recurring: [],
    memories: [],
    hiddenMemories: 0,
    transactions: [],
    accounts: [],
    total: null,
    balanceHistory: [],
    monthNet: 0,
    chat: [],
    answered: [],
  };
}

export type NewMemory = { kind: MemoryKind; text: string; highlight: string; source: string };

export type AppDataApi = {
  data: AppData;
  /** Re-reads everything from the backend without showing the loading state. No-op for sample data. */
  reload: () => Promise<void>;
  addMemory: (m: NewMemory) => string;
  removeMemory: (id: string) => void;
  restoreMemory: (m: Memory, index: number) => void;
  setRecurringStatus: (id: string, status: Recurring["status"]) => void;
  upsertBudget: (b: Budget) => void;
  addGoal: (g: Omit<Goal, "id">) => string;
  removeGoal: (id: string) => void;
  /** Changes one transaction's category. */
  recategorize: (txId: string, category: CategoryId) => void;
  /** Files every transaction from this merchant under `category` from now on, and remembers it. */
  rememberCategory: (txId: string, merchant: string, category: CategoryId) => Promise<MemoryOutcome>;
  markAnswered: (insightId: string, answered: boolean) => void;
  reset: () => void;
};

export const AppDataContext = createContext<AppDataApi | null>(null);

export function useAppData() {
  const api = useContext(AppDataContext);
  if (!api) throw new Error("useAppData must be used inside <AppDataProvider>");
  return api;
}

/** Renewals in a category that are still due before the month ends. */
export function committedFor(category: CategoryId, data: Pick<AppData, "recurring" | "today" | "monthEnd">) {
  const due = data.recurring.filter(
    (r) => r.status === "active" && r.category === category && r.next >= data.today && r.next <= data.monthEnd,
  );
  const amount = due.reduce((s, r) => s + r.amount, 0);
  if (!due.length) return { amount: 0, label: null as string | null, names: "", when: "", items: due };
  const names = due.map((r) => r.merchant);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const sameDay = due.every((r) => r.next === due[0].next);
  const when = sameDay ? `on ${longDate(due[0].next).split(",")[0]}` : "before the month ends";
  return { amount, label: `${list} ${when}`, names: list, when, items: due };
}

export type BudgetView = Budget & {
  committed: number;
  committedLabel: string | null;
  /** "Netflix and Spotify renew on Friday" */
  renewalSentence: string | null;
  projected: number;
  left: number;
  over: boolean;
};

export function budgetViews(data: AppData): BudgetView[] {
  return data.budgets.map((b) => {
    const c = committedFor(b.category, data);
    const projected = b.spent + c.amount;
    return {
      ...b,
      committed: c.amount,
      committedLabel: c.label,
      renewalSentence: c.label ? `${c.names} ${c.items.length > 1 ? "renew" : "renews"} ${c.when}` : null,
      projected,
      left: b.limit - projected,
      over: projected > b.limit,
    };
  });
}

/** What the user has spent in a category this month, from imported transactions. */
export function spentThisMonth(data: AppData, category: CategoryId) {
  const month = data.today.slice(0, 7);
  return data.transactions
    .filter((t) => t.category === category && t.amount < 0 && t.date.startsWith(month))
    .reduce((s, t) => s + -t.amount, 0);
}

export function memoryCount(data: AppData) {
  return data.hiddenMemories + data.memories.length;
}

/** Money free until payday: `monthNet`, adjusted for renewals the user paused or resumed before payday. */
export function freeUntilPayday(data: AppData) {
  let free = data.monthNet;
  for (const r of data.recurring) {
    if (!r.baseStatus || r.baseStatus === r.status || r.next < data.today || r.next > data.payday) continue;
    free += r.status === "paused" ? r.amount : -r.amount;
  }
  return free;
}

/** Next date the user is paid, from the profile's day of the month. Month end when irregular or unknown. */
export function nextPayday(today: string, payday: number | "irregular" | undefined) {
  if (typeof payday !== "number") return monthEndOf(today);
  const [y, m, d] = today.split("-").map(Number);
  const on = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, Math.min(payday, last))).toISOString().slice(0, 10);
  };
  return d < payday ? on(y, m) : on(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
}

/** Live `monthNet`: this month's income minus spending, minus active renewals due before payday. */
export function liveMonthNet(data: Pick<AppData, "transactions" | "recurring" | "today" | "payday">) {
  const month = data.today.slice(0, 7);
  const net = data.transactions.filter((t) => t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);
  const due = data.recurring
    .filter((r) => r.status === "active" && r.next >= data.today && r.next <= data.payday)
    .reduce((s, r) => s + r.amount, 0);
  return net - due;
}

export function walletAccount(data: AppData) {
  return data.accounts.find((a) => a.source === "tatum");
}

export function shellStats(data: AppData) {
  const wallet = walletAccount(data);
  const month = data.today.slice(0, 7);
  const loading = data.source === "loading";
  if (loading) {
    // Nothing to count yet: badges stay hidden and the shell shows placeholders instead of sample numbers.
    return {
      loading,
      transactions: 0,
      budgetsOver: 0,
      dueSoon: 0,
      memories: 0,
      freeUntilPayday: 0,
      daysToPayday: 0,
      walletSyncedToday: false,
      walletBalance: null,
    };
  }
  return {
    loading,
    transactions: data.transactions.filter((t) => t.date.startsWith(month)).length,
    budgetsOver: budgetViews(data).filter((b) => b.over).length,
    dueSoon: data.recurring.filter((r) => r.status === "active" && daysBetween(data.today, r.next) <= 3).length,
    memories: memoryCount(data),
    freeUntilPayday: freeUntilPayday(data),
    daysToPayday: daysBetween(data.today, data.payday),
    walletSyncedToday: wallet?.syncedAt === data.today,
    walletBalance: wallet?.balance ?? null,
  };
}

export type ShellStats = ReturnType<typeof shellStats>;

import { api, ApiError } from "@/lib/api";
import type {
  Account,
  Budget,
  CategoryId,
  ChatMessage,
  Goal,
  Memory,
  MemoryKind,
  Recurring,
  Transaction,
  WalletStatus,
} from "@/lib/demo-data";
import { daysBetween, money } from "@/lib/format";
import { highlightFor } from "@/lib/highlight";

/** Response shapes of the Sovra backend (backend/README.md, Endpoints). */
export type ApiMemory = { id: string; kind: MemoryKind; text: string; source: string; uses: number; createdAt: string };
type ApiBudget = { category: CategoryId; limit: number; spent: number };
type ApiGoal = { id: string; name: string; target: number; saved: number; due: string; weekly: number | null };
type ApiRecurring = { merchant: string; merchantKey: string; category: CategoryId; amount: number; nextDate: string };
type ApiTransaction = Omit<Transaction, "accountId"> & { accountId: string | null };
type ApiAccount = { id: string; name: string; balance: number | null; syncedAt: string | null; lastTransactionDate: string | null };
type ApiWallet = { address: string; usdc: number | null; status: WalletStatus; syncedAt: string | null };
type ApiSummary = { total: number | null; trend: { date: string; balance: number }[] };
export type ApiAskMessage = { id: string | null; question: string; answer: string; usedMemories: { id: string | null; text: string }[] };

export const toMemory = (m: ApiMemory): Memory => ({
  id: m.id,
  date: m.createdAt.slice(0, 10),
  kind: m.kind,
  text: m.text,
  highlight: highlightFor(m.text),
  source: m.source,
  uses: m.uses,
});

function toGoal(g: ApiGoal, today: string): Goal {
  const weeks = Math.max(1, Math.ceil(daysBetween(today, g.due) / 7));
  const weekly = g.weekly ?? (g.target > g.saved ? Math.ceil((g.target - g.saved) / weeks) : 0);
  return {
    ...g,
    weekly,
    note: g.saved >= g.target ? "Already fully saved." : `Put aside ${money(weekly, { whole: true })} a week and you reach it on time.`,
  };
}

/** Recurring charges have no id on the backend; the merchant key is stable across imports. */
const toRecurring = (r: ApiRecurring, paused: Set<string>): Recurring => {
  const status = paused.has(r.merchantKey) ? "paused" : "active";
  return { id: r.merchantKey, merchant: r.merchant, amount: r.amount, next: r.nextDate, category: r.category, status, baseStatus: status };
};

export const toChat = (m: ApiAskMessage, i: number): ChatMessage[] => {
  const id = m.id ?? `a${i}`;
  return [
    { id: `${id}-q`, role: "user", text: m.question },
    { id, role: "sovra", text: m.answer, usedMemories: m.usedMemories.length ? m.usedMemories : undefined },
  ];
};

const WALLET_DETAIL: Record<WalletStatus, string> = {
  live: "USDC on Sui, read live through Tatum",
  not_configured: "Tatum isn't set up on the server yet",
  unavailable: "Tatum didn't answer. Try refreshing",
  skipped_demo: "Demo accounts aren't read onchain",
};

export type LiveData = {
  budgets: Budget[];
  goals: Goal[];
  recurring: Recurring[];
  memories: Memory[];
  transactions: Transaction[];
  accounts: Account[];
  total: number | null;
  balanceHistory: number[];
  chat: ChatMessage[];
};

/** Thrown when the backend runs without a database, so there is no account data to show. */
export class NoDatabaseError extends Error {}

const optional = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

/** Loads everything the app screens show. `paused` holds merchant keys the user paused in Sovra. */
export async function loadLiveData(today: string, paused: Set<string>): Promise<LiveData> {
  const [budgets, goals, transactions, recurring, accounts, memories, summary, history] = await Promise.all([
    api<{ budgets: ApiBudget[] }>(`/budgets?month=${today.slice(0, 7)}`).catch((err: unknown) => {
      if (err instanceof ApiError && err.code === "not_configured") throw new NoDatabaseError();
      throw err;
    }),
    api<{ goals: ApiGoal[] }>("/goals"),
    api<{ transactions: ApiTransaction[] }>("/transactions?limit=500"),
    api<{ recurring: ApiRecurring[] }>("/recurring"),
    api<{ accounts: ApiAccount[]; wallet: ApiWallet }>("/accounts"),
    // Memories and Ask history are extras: the rest of the app works without them.
    optional(api<{ memories: ApiMemory[] }>("/memories"), { memories: [] }),
    optional(api<ApiSummary>("/accounts/summary"), { total: null, trend: [] }),
    optional(api<{ messages: ApiAskMessage[] }>("/ask/history?limit=20"), { messages: [] }),
  ]);

  const wallet = accounts.wallet;
  const walletAccount: Account = {
    id: "sui",
    name: "Sui wallet",
    detail: WALLET_DETAIL[wallet.status],
    balance: wallet.usdc,
    source: "tatum",
    address: wallet.address,
    syncedAt: wallet.syncedAt?.slice(0, 10) ?? "",
    status: wallet.status,
  };

  return {
    budgets: budgets.budgets.map(({ category, limit, spent }) => ({ category, limit, spent })),
    goals: goals.goals.map((g) => toGoal(g, today)),
    transactions: transactions.transactions.map((t) => ({ ...t, accountId: t.accountId ?? "" })),
    recurring: recurring.recurring.map((r) => toRecurring(r, paused)),
    accounts: [
      ...accounts.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        detail: "Imported from CSV",
        balance: a.balance,
        source: "csv" as const,
        syncedAt: (a.syncedAt ?? a.lastTransactionDate ?? "").slice(0, 10),
      })),
      walletAccount,
    ],
    memories: memories.memories.map(toMemory),
    total: summary.total,
    // The trend covers bank accounts; the live wallet balance is added flat so it lines up with the total.
    balanceHistory: summary.trend.map((d) => d.balance + (wallet.usdc ?? 0)),
    chat: [...history.messages].reverse().flatMap(toChat),
  };
}

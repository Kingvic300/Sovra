/**
 * Demo data for the UI. Every screen reads from here until the real
 * sources are wired in: CSV import + Postgres for transactions,
 * Tatum Sui RPC for the wallet, and Walrus Memory for memories.
 */

export const TODAY = "2026-10-27";

/** Sui address used by the demo account and whenever no one is signed in. */
export const DEMO_WALLET_ADDRESS = "0x7b3e9c41d2a85f60e1c4b9a7d03f5e28c6a1b94d7e2f05c8a3961d4b7e0c2f9a";
export const USER_NAME = "Ada";

export type CategoryId =
  | "food"
  | "transport"
  | "entertainment"
  | "business"
  | "shopping"
  | "bills"
  | "health"
  | "income"
  | "transfer"
  | "uncategorized";

export const CATEGORIES: Record<CategoryId, string> = {
  food: "Food and groceries",
  transport: "Transport",
  entertainment: "Entertainment",
  business: "Business supplies",
  shopping: "Shopping",
  bills: "Bills and rent",
  health: "Health",
  income: "Income",
  transfer: "Rent share",
  uncategorized: "Uncategorized",
};

/** How the backend read the Sui wallet. Sample data is always "live". */
export type WalletStatus = "live" | "not_configured" | "unavailable" | "skipped_demo" | "no_wallet";

export type Account = {
  id: string;
  name: string;
  detail: string;
  /** Null when the balance isn't known (a CSV without a balance column, or a wallet that couldn't be read). */
  balance: number | null;
  source: "csv" | "tatum";
  address?: string;
  /** ISO date, empty when never read. */
  syncedAt: string;
  status?: WalletStatus;
};

export const ACCOUNTS: Account[] = [
  {
    id: "everyday",
    name: "Everyday account",
    detail: "Imported from CSV",
    balance: 2486.0,
    source: "csv",
    syncedAt: "2026-10-26",
  },
  {
    id: "savings",
    name: "Savings pot",
    detail: "Imported from CSV",
    balance: 700.0,
    source: "csv",
    syncedAt: "2026-10-26",
  },
  {
    id: "sui",
    name: "Sui wallet",
    detail: "USDC on Sui, read live through Tatum",
    balance: 1032.4,
    source: "tatum",
    address: DEMO_WALLET_ADDRESS,
    syncedAt: "2026-10-27",
  },
];

export type Transaction = {
  id: string;
  date: string;
  merchant: string;
  category: CategoryId;
  amount: number;
  accountId: string;
  /** Set when the category came from something Sovra remembered. */
  learnedFrom?: string;
};

export const TRANSACTIONS: Transaction[] = [
  { id: "t1", date: "2026-10-27", merchant: "Shoprite", category: "food", amount: -38.2, accountId: "everyday" },
  { id: "t2", date: "2026-10-26", merchant: "Amazon", category: "business", amount: -46.0, accountId: "everyday", learnedFrom: "m3" },
  { id: "t3", date: "2026-10-25", merchant: "Upwork payout", category: "income", amount: 650.0, accountId: "sui" },
  { id: "t4", date: "2026-10-25", merchant: "Bolt", category: "transport", amount: -6.2, accountId: "everyday" },
  { id: "t5", date: "2026-10-24", merchant: "Spotify", category: "entertainment", amount: -10.99, accountId: "everyday" },
  { id: "t6", date: "2026-10-23", merchant: "Tunde Bakare", category: "transfer", amount: -225.0, accountId: "sui", learnedFrom: "m7" },
  { id: "t7", date: "2026-10-22", merchant: "Chicken Republic", category: "food", amount: -12.4, accountId: "everyday" },
  { id: "t8", date: "2026-10-21", merchant: "Bolt", category: "transport", amount: -14.8, accountId: "everyday" },
  { id: "t9", date: "2026-10-20", merchant: "Filmhouse Cinemas", category: "entertainment", amount: -18.0, accountId: "everyday" },
  { id: "t10", date: "2026-10-19", merchant: "Medplus Pharmacy", category: "health", amount: -9.6, accountId: "everyday" },
  { id: "t11", date: "2026-10-18", merchant: "Amazon", category: "business", amount: -21.5, accountId: "everyday", learnedFrom: "m3" },
  { id: "t12", date: "2026-10-17", merchant: "Shoprite", category: "food", amount: -54.3, accountId: "everyday" },
  { id: "t13", date: "2026-10-16", merchant: "Jumia", category: "shopping", amount: -32.0, accountId: "everyday" },
  { id: "t14", date: "2026-10-15", merchant: "Bolt", category: "transport", amount: -22.5, accountId: "everyday" },
  { id: "t15", date: "2026-10-12", merchant: "Steam", category: "entertainment", amount: -24.0, accountId: "everyday" },
  { id: "t16", date: "2026-10-10", merchant: "Toptal invoice", category: "income", amount: 1180.0, accountId: "everyday" },
];

export type Budget = {
  category: CategoryId;
  limit: number;
  spent: number;
};

export const BUDGETS: Budget[] = [
  { category: "entertainment", limit: 100, spent: 82 },
  { category: "food", limit: 320, spent: 214 },
  { category: "transport", limit: 150, spent: 121 },
  { category: "business", limit: 120, spent: 46 },
  { category: "shopping", limit: 150, spent: 64 },
  { category: "health", limit: 60, spent: 9.6 },
];

export type BudgetSuggestion = {
  id: string;
  category: CategoryId;
  text: string;
  from: number;
  to: number;
};

export const BUDGET_SUGGESTIONS: BudgetSuggestion[] = [
  {
    id: "s1",
    category: "transport",
    text: "You've used over 80% of transport three months running. Late rides home count as safety for you, so a higher limit is more honest than cutting them.",
    from: 150,
    to: 170,
  },
  {
    id: "s2",
    category: "shopping",
    text: "Shopping has stayed under $70 since you moved Amazon orders to business supplies. You could move $50 of this limit to the laptop fund.",
    from: 150,
    to: 100,
  },
];

export type Goal = {
  id: string;
  name: string;
  saved: number;
  target: number;
  due: string;
  weekly: number;
  note: string;
};

export const GOALS: Goal[] = [
  {
    id: "g1",
    name: "Laptop fund",
    saved: 740,
    target: 1200,
    due: "2027-01-31",
    weekly: 40,
    note: "Put aside $40 a week and you reach it by mid-January.",
  },
  {
    id: "g2",
    name: "Emergency cushion",
    saved: 700,
    target: 2000,
    due: "2027-06-30",
    weekly: 55,
    note: "Three months of rent and food. On pace for June if income stays near $1,800.",
  },
];

export type MemoryKind = "goal" | "limit" | "correction" | "preference" | "decision";

export const MEMORY_KINDS: Record<MemoryKind, string> = {
  goal: "Goals",
  limit: "Limits",
  correction: "Corrections",
  preference: "Preferences",
  decision: "Decisions",
};

export type Memory = {
  id: string;
  date: string;
  kind: MemoryKind;
  /** Full sentence. `highlight` must appear inside it verbatim. */
  text: string;
  highlight: string;
  source: string;
  uses: number;
};

export const MEMORIES: Memory[] = [
  { id: "m1", date: "2026-09-14", kind: "goal", text: "You're saving for a laptop, $1,200 by January.", highlight: "laptop, $1,200 by January", source: "You told Sovra", uses: 9 },
  { id: "m2", date: "2026-09-14", kind: "limit", text: "Keep entertainment under $100 a month.", highlight: "under $100 a month", source: "You told Sovra", uses: 6 },
  { id: "m3", date: "2026-10-03", kind: "correction", text: "Amazon orders are business supplies, not shopping.", highlight: "business supplies", source: "You edited a transaction", uses: 4 },
  { id: "m4", date: "2026-10-09", kind: "preference", text: "You're paid on the 25th, so a low balance the week before is normal.", highlight: "paid on the 25th", source: "You dismissed an alert", uses: 3 },
  { id: "m5", date: "2026-10-12", kind: "decision", text: "You kept Spotify and paused Disney+ in October.", highlight: "paused Disney+", source: "You chose in a review", uses: 2 },
  { id: "m6", date: "2026-10-18", kind: "preference", text: "Bolt rides after 10 pm are for safety, not a budget leak.", highlight: "for safety", source: "You told Sovra", uses: 3 },
  { id: "m7", date: "2026-10-20", kind: "correction", text: "Transfers to Tunde are your rent share.", highlight: "rent share", source: "You edited a transaction", uses: 2 },
];

/** Total stored on Walrus, including older ones not shown in the demo list. */
export const MEMORY_COUNT = 14;

export type Recurring = {
  id: string;
  merchant: string;
  amount: number;
  next: string;
  category: CategoryId;
  status: "active" | "paused";
  /** Status the month's figures already count. Differs from `status` once the user pauses or resumes. */
  baseStatus?: "active" | "paused";
  note?: string;
  /** Note is a warning rather than something Sovra remembered. */
  warn?: boolean;
};

export const RECURRING: Recurring[] = ([
  { id: "r1", merchant: "Netflix", amount: 17.99, next: "2026-10-30", category: "entertainment", status: "active", note: "Takes entertainment over your $100 limit", warn: true },
  { id: "r2", merchant: "Spotify", amount: 10.99, next: "2026-10-30", category: "entertainment", status: "active", note: "You chose to keep this in October" },
  { id: "r3", merchant: "Rent share to Tunde", amount: 225, next: "2026-11-01", category: "transfer", status: "active" },
  { id: "r4", merchant: "FitHub gym", amount: 30, next: "2026-11-03", category: "health", status: "active" },
  { id: "r5", merchant: "Spectranet internet", amount: 25, next: "2026-11-05", category: "bills", status: "active" },
  { id: "r6", merchant: "ChatGPT Plus", amount: 20, next: "2026-11-12", category: "business", status: "active" },
  { id: "r7", merchant: "iCloud+", amount: 2.99, next: "2026-11-15", category: "bills", status: "active" },
  { id: "r8", merchant: "Disney+", amount: 13.99, next: "2026-11-12", category: "entertainment", status: "paused", note: "Paused on 12 Oct" },
] satisfies Recurring[]).map((r) => ({ ...r, baseStatus: r.status }));

/** Daily total balance for the last 30 days, oldest first. */
export const BALANCE_HISTORY = [
  3606, 3590, 3571, 3640, 3622, 3598, 3575, 3702, 3688, 3660, 3649, 3630, 3611, 3790, 3772,
  3745, 3730, 3718, 3705, 3690, 3940, 3921, 3910, 3880, 3868, 4250, 4232, 4226, 4220, 4218.4,
];

export const MONTH_NET = 612;

export type ChatMessage = {
  id: string;
  role: "user" | "sovra";
  text: string;
  /** Memories the answer relied on. */
  usedMemories?: { id: string | null; text: string }[];
};

export const CHAT: ChatMessage[] = [
  { id: "c1", role: "user", text: "Can I afford a $300 phone this month?" },
  {
    id: "c2",
    role: "sovra",
    text: "Not without slowing the laptop fund. After rent on 1 November and your renewals, you have about $612 free until you're paid on the 25th. A $300 phone leaves $312, and the laptop target slips to late February. If the phone can wait until after the 25th, both fit.",
    usedMemories: [MEMORIES[0], MEMORIES[3]].map(({ id, text }) => ({ id, text })),
  },
];

export const PAYDAY = "2026-11-25";

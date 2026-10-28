import type { Db } from "../database/database.service.js";
import { accounts, budgets, categoryRules, goals, memories, profiles, transactions } from "../database/schema.js";
import { merchantKey, type CategoryId } from "../shared/categories.js";
import { categoryRuleSentence, goalSentence, limitSentence, paydaySentence } from "../shared/memory-text.js";

/** Anything with Drizzle's insert builder: the database or a transaction. */
type Writer = Pick<Db, "insert">;

const DAY = 86_400_000;

/** Monthly charges, `daysAgo` is the latest one; two earlier ones follow 30 and 60 days before. */
const MONTHLY: { merchant: string; amount: number; category: CategoryId; daysAgo: number }[] = [
  { merchant: "Netflix", amount: -17.99, category: "entertainment", daysAgo: 27 },
  { merchant: "Spotify", amount: -10.99, category: "entertainment", daysAgo: 27 },
  { merchant: "Tunde Bakare", amount: -225, category: "transfer", daysAgo: 26 },
  { merchant: "FitHub gym", amount: -30, category: "health", daysAgo: 24 },
  { merchant: "Spectranet internet", amount: -25, category: "bills", daysAgo: 22 },
  { merchant: "Toptal invoice", amount: 1180, category: "income", daysAgo: 17 },
  { merchant: "ChatGPT Plus", amount: -20, category: "business", daysAgo: 15 },
  { merchant: "iCloud+", amount: -2.99, category: "bills", daysAgo: 12 },
  { merchant: "Upwork payout", amount: 650, category: "income", daysAgo: 2 },
];

const ONE_OFF: [daysAgo: number, merchant: string, amount: number, category: CategoryId][] = [
  [0, "Shoprite", -38.2, "food"],
  [1, "Amazon", -46, "business"],
  [2, "Bolt", -6.2, "transport"],
  [5, "Chicken Republic", -12.4, "food"],
  [6, "Bolt", -14.8, "transport"],
  [7, "Filmhouse Cinemas", -18, "entertainment"],
  [8, "Medplus Pharmacy", -9.6, "health"],
  [9, "Amazon", -21.5, "business"],
  [10, "Shoprite", -54.3, "food"],
  [11, "Jumia", -32, "shopping"],
  [12, "Bolt", -22.5, "transport"],
  [15, "Steam", -24, "entertainment"],
  [31, "Shoprite", -41.75, "food"],
  [35, "Bolt", -9.4, "transport"],
  [38, "Chicken Republic", -15.6, "food"],
  [40, "Amazon", -33, "business"],
  [44, "Jumia", -27.5, "shopping"],
  [45, "Shoprite", -47.1, "food"],
  [46, "Disney+", -13.99, "entertainment"],
  [50, "Bolt", -11.2, "transport"],
  [62, "Shoprite", -36.9, "food"],
];

/**
 * Sample data for a new demo account, matching the frontend's demo (Ada, the laptop fund, the
 * entertainment limit, Netflix and Spotify about to renew). Dates are relative to `today`, so
 * budgets, recurring charges and goals look current whenever the demo starts.
 */
export async function seedDemoData(db: Writer, address: string, today = new Date()) {
  const daysAgo = (n: number) => new Date(today.getTime() - n * DAY).toISOString().slice(0, 10);
  const daysAhead = (n: number) => new Date(today.getTime() + n * DAY);
  const ago = (n: number) => new Date(today.getTime() - n * DAY);

  const goal = { name: "Laptop fund", target: 1200, due: daysAhead(95).toISOString().slice(0, 10) };
  const limit = { category: "entertainment" as const, amount: 100 };

  await db.insert(profiles).values({
    userAddress: address,
    name: "Ada",
    onboarded: true,
    goal,
    limit,
    payday: "25",
    sources: { csv: true, sui: true },
  });

  const remembered = await db
    .insert(memories)
    .values(
      (
        [
          ["goal", goalSentence({ ...goal, name: "a laptop" }), "You told Sovra", 9, 43],
          ["limit", limitSentence(limit), "You told Sovra", 6, 43],
          ["correction", categoryRuleSentence("Amazon", "business"), "You edited a transaction", 4, 24],
          ["preference", paydaySentence(25), "You dismissed an alert", 3, 18],
          ["decision", "You kept Spotify and paused Disney+ last month.", "You chose in a review", 2, 15],
          ["preference", "Bolt rides after 10 pm are for safety, not a budget leak.", "You told Sovra", 3, 9],
          ["correction", categoryRuleSentence("Tunde Bakare", "transfer"), "You edited a transaction", 2, 7],
        ] as const
      ).map(([kind, text, source, uses, age]) => ({
        userAddress: address,
        kind,
        text,
        source,
        uses,
        status: "local" as const,
        createdAt: ago(age),
      })),
    )
    .returning({ id: memories.id, text: memories.text });
  const memoryFor = (merchant: string) => remembered.find((m) => m.text.startsWith(`${merchant} transactions`))?.id ?? null;

  const learned = new Map([
    [merchantKey("Amazon"), memoryFor("Amazon")],
    [merchantKey("Tunde Bakare"), memoryFor("Tunde Bakare")],
  ]);
  await db.insert(categoryRules).values([
    { userAddress: address, merchantKey: merchantKey("Amazon"), category: "business", memoryId: memoryFor("Amazon") },
    { userAddress: address, merchantKey: merchantKey("Tunde Bakare"), category: "transfer", memoryId: memoryFor("Tunde Bakare") },
  ]);

  const [everyday] = await db
    .insert(accounts)
    .values([
      { userAddress: address, kind: "csv", name: "Everyday account", balance: "2486.00", syncedAt: ago(1) },
      { userAddress: address, kind: "csv", name: "Savings pot", balance: "700.00", syncedAt: ago(1) },
    ])
    .returning({ id: accounts.id });

  const rows = [
    ...MONTHLY.flatMap((m) => [0, 30, 60].map((offset) => [m.daysAgo + offset, m.merchant, m.amount, m.category] as const)),
    ...ONE_OFF,
  ];
  await db.insert(transactions).values(
    rows.map(([age, merchant, amount, category]) => {
      const key = merchantKey(merchant) || merchant.toLowerCase();
      return {
        userAddress: address,
        accountId: everyday.id,
        date: daysAgo(age),
        merchant,
        merchantKey: key,
        amount: amount.toFixed(2),
        category,
        learnedFromMemoryId: learned.get(key) ?? null,
      };
    }),
  );

  await db.insert(budgets).values(
    (
      [
        ["entertainment", 100],
        ["food", 320],
        ["transport", 150],
        ["business", 120],
        ["shopping", 150],
        ["health", 60],
      ] as const
    ).map(([category, amount]) => ({ userAddress: address, category, limit: amount.toFixed(2) })),
  );

  await db.insert(goals).values([
    { userAddress: address, name: goal.name, target: "1200.00", saved: "740.00", due: goal.due, weekly: "40.00" },
    {
      userAddress: address,
      name: "Emergency cushion",
      target: "2000.00",
      saved: "700.00",
      due: daysAhead(245).toISOString().slice(0, 10),
      weekly: "55.00",
    },
  ]);
}

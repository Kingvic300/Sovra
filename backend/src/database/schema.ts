import { boolean, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  address: text("address").primaryKey(),
  method: text("method", { enum: ["google", "demo"] }).notNull(),
  name: text("name"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoalJson = { name: string; target: number; due: string };
export type LimitJson = { category: string; amount: number };
export type SourcesJson = { csv: boolean; sui: boolean };

export const profiles = pgTable("profiles", {
  userAddress: text("user_address")
    .primaryKey()
    .references(() => users.address, { onDelete: "cascade" }),
  name: text("name").notNull(),
  onboarded: boolean("onboarded").notNull().default(false),
  goal: jsonb("goal").$type<GoalJson | null>(),
  limit: jsonb("limit").$type<LimitJson | null>(),
  /** Day of month as a string ("25") or "irregular". */
  payday: text("payday"),
  sources: jsonb("sources").$type<SourcesJson>().notNull().default({ csv: false, sui: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["csv", "sui"] }).notNull(),
    name: text("name").notNull(),
    balance: numeric("balance", { precision: 14, scale: 2 }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => [index("accounts_user_idx").on(t.userAddress)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    merchant: text("merchant").notNull(),
    merchantKey: text("merchant_key").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    category: text("category").notNull(),
    learnedFromMemoryId: uuid("learned_from_memory_id"),
    raw: jsonb("raw").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transactions_user_date_idx").on(t.userAddress, t.date), index("transactions_user_merchant_idx").on(t.userAddress, t.merchantKey)],
);

/** "Always file this merchant under this category", learned from the user's edits. */
export const categoryRules = pgTable(
  "category_rules",
  {
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address, { onDelete: "cascade" }),
    merchantKey: text("merchant_key").notNull(),
    category: text("category").notNull(),
    memoryId: uuid("memory_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userAddress, t.merchantKey] })],
);

export const budgets = pgTable(
  "budgets",
  {
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address, { onDelete: "cascade" }),
    category: text("category").notNull(),
    limit: numeric("limit", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userAddress, t.category] })],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address, { onDelete: "cascade" }),
    name: text("name").notNull(),
    target: numeric("target", { precision: 14, scale: 2 }).notNull(),
    saved: numeric("saved", { precision: 14, scale: 2 }).notNull().default("0"),
    due: date("due").notNull(),
    weekly: numeric("weekly", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goals_user_idx").on(t.userAddress)],
);

/**
 * Local index of everything sent to Walrus Memory. The relayer's list endpoint returns
 * metadata without text and has no delete, so the text, kind and "forgotten" flag live here.
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["goal", "limit", "correction", "preference", "decision"] }).notNull(),
    text: text("text").notNull(),
    source: text("source").notNull(),
    jobId: text("job_id"),
    blobId: text("blob_id"),
    status: text("status", { enum: ["pending", "stored", "failed"] }).notNull().default("pending"),
    uses: integer("uses").notNull().default(0),
    forgottenAt: timestamp("forgotten_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memories_user_idx").on(t.userAddress)],
);

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

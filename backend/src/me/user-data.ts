import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  accounts,
  askMessages,
  budgetSuggestionDecisions,
  budgets,
  categoryRules,
  goals,
  memories,
  profiles,
  recurringStates,
  reminders,
  transactions,
} from "../database/schema.js";

/**
 * Every table holding one user's data, keyed by its `user_address` column. Export reads all of
 * them, deletion checks all of them are empty, and a test fails if a table with `user_address`
 * is added to the schema without being listed here.
 */
export const USER_DATA_TABLES: Record<string, { table: PgTable; owner: PgColumn }> = {
  profiles: { table: profiles, owner: profiles.userAddress },
  accounts: { table: accounts, owner: accounts.userAddress },
  transactions: { table: transactions, owner: transactions.userAddress },
  categoryRules: { table: categoryRules, owner: categoryRules.userAddress },
  budgets: { table: budgets, owner: budgets.userAddress },
  goals: { table: goals, owner: goals.userAddress },
  memories: { table: memories, owner: memories.userAddress },
  askMessages: { table: askMessages, owner: askMessages.userAddress },
  recurringStates: { table: recurringStates, owner: recurringStates.userAddress },
  budgetSuggestionDecisions: { table: budgetSuggestionDecisions, owner: budgetSuggestionDecisions.userAddress },
  reminders: { table: reminders, owner: reminders.userAddress },
};

/**
 * Tables that are deliberately not exported. `users` is exported separately (without the password
 * hash); `auth_nonces` holds five-minute sign-in challenges, which are deleted with the account.
 */
export const NOT_EXPORTED = new Set(["users", "auth_nonces"]);

import type { CutCandidate, CutPick, CutTarget, KeptPick } from "../cuts/cut-plan.js";
import type { CategoryId } from "../shared/categories.js";

export type MerchantToCategorize = {
  merchantKey: string;
  /** One example description from the statement. */
  example: string;
  /** Typical signed amount: negative is money out. */
  amount: number;
};

export type AnswerInput = {
  question: string;
  /** Compact JSON-able facts the model may quote: balances, budgets, goals, bills. */
  context: Record<string, unknown>;
  memories: { kind: string | null; text: string }[];
  missing: string[];
};

export type CutPlanInput = {
  currency: string;
  today: string;
  /** Categories to bring back under their limit. */
  targets: CutTarget[];
  candidates: CutCandidate[];
  /** What the user told Sovra that may bear on the cuts, word for word. */
  memories: string[];
  goals: { name: string; target: number; saved: number; due: string }[];
};

/** The model's choice among the candidates. Amounts are never taken from it: see applyPicks. */
export type CutPlanResult = { summary: string; cuts: CutPick[]; kept: KeptPick[]; model: string };

/** One row read from a statement that isn't a table, such as a PDF. */
export type ExtractedTransaction = { date: string; description: string; amount: number; balance: number | null };

/** What Sovra needs from a language model. */
export interface AiProvider {
  readonly configured: boolean;
  /** Returns a category for every merchant it could classify. Merchants it skips are left out. */
  categorize(merchants: MerchantToCategorize[]): Promise<Map<string, CategoryId>>;
  answer(input: AnswerInput): Promise<{ text: string; model: string }>;
  /** Reads transactions out of a statement's plain text. Amounts are signed: negative is money out. */
  extractTransactions(statementText: string): Promise<ExtractedTransaction[]>;
  /** Picks which candidate cuts to suggest, and why, respecting what the user told Sovra. */
  planCuts(input: CutPlanInput): Promise<CutPlanResult>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");

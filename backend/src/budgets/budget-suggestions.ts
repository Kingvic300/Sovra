import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Session } from "../auth/session.js";
import { AppError, notFound } from "../common/errors.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, budgetSuggestionDecisions, budgets, transactions } from "../database/schema.js";
import { CurrencyService } from "../fx/currency.service.js";
import { FxService } from "../fx/fx.service.js";
import { MemwalService } from "../memory/memwal.service.js";
import { CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import { formatMoney } from "../shared/currency.js";
import { BudgetsService } from "./budgets.service.js";

/** How long a decision keeps the same kind of suggestion away. */
export const SUPPRESS_DAYS = 90;
const DAY = 86_400_000;

export type SuggestionDirection = "raise" | "lower";

export type BudgetSuggestion = {
  /** Deterministic: the same data gives the same id. */
  id: string;
  category: string;
  label: string;
  direction: SuggestionDirection;
  from: number;
  to: number;
  /** The user's currency: limits, targets and evidence are all in it. */
  currency: string;
  text: string;
  /** What the rule saw: spending in each of the last three full months. */
  evidence: { month: string; spent: number }[];
};

export type SuggestionInput = {
  /** The user's currency, for the wording. Amounts must already be in it. */
  currency: string;
  limits: { category: string; limit: number }[];
  /** The last three full months, oldest first. */
  months: string[];
  /** Spending per category for each of `months`, in the same order. */
  spent: Map<string, number[]>;
  /** This month's projected spending (spent + renewals still due) per category. */
  projected: Map<string, number>;
  /** `category:direction` pairs the user dismissed recently. */
  suppressed: Set<string>;
};

const ceilTo10 = (n: number) => Math.ceil(n / 10) * 10;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const labelOf = (category: string) => CATEGORY_LABELS[category as CategoryId] ?? category;

/**
 * Deterministic, explainable rules over the last three full months, for categories with a limit:
 * - raise: over the limit in at least 2 of 3 months and at least 80% used in all 3. Suggests the
 *   median month rounded up to $10, so the limit matches what the user really spends.
 * - lower: under 60% used in all 3 months (with some spending). Suggests the highest month plus
 *   20% headroom, rounded up to $10, and only if this month's projection fits under it.
 */
export function suggestBudgets(input: SuggestionInput): BudgetSuggestion[] {
  const found: BudgetSuggestion[] = [];
  const money = (n: number) => formatMoney(n, input.currency);
  for (const { category, limit } of input.limits) {
    const spent = input.spent.get(category) ?? input.months.map(() => 0);
    const evidence = input.months.map((month, i) => ({ month, spent: spent[i] ?? 0 }));
    const label = labelOf(category);
    const make = (direction: SuggestionDirection, to: number, text: string) => {
      if (input.suppressed.has(`${category}:${direction}`)) return;
      found.push({ id: `${category}:${direction}:${to}`, category, label, direction, from: limit, to, currency: input.currency, text, evidence });
    };

    const overMonths = spent.filter((s) => s > limit).length;
    if (overMonths >= 2 && spent.every((s) => s >= 0.8 * limit)) {
      const typical = median(spent);
      const to = ceilTo10(typical);
      make(
        "raise",
        to,
        `You went over your ${money(limit)} ${label.toLowerCase()} limit in ${overMonths} of the last 3 months, with a typical month at ${money(typical)}. A ${money(to)} limit matches what you actually spend.`,
      );
      continue;
    }

    const highest = Math.max(...spent);
    if (highest > 0 && spent.every((s) => s < 0.6 * limit)) {
      const to = Math.max(10, ceilTo10(highest * 1.2));
      if (to < limit && (input.projected.get(category) ?? 0) <= to) {
        make(
          "lower",
          to,
          `You've used under 60% of your ${money(limit)} ${label.toLowerCase()} limit for 3 months running, ${money(highest)} at most. Lowering it to ${money(to)} frees ${money(limit - to)} a month.`,
        );
      }
    }
  }
  return found.sort((a, b) => (a.direction === b.direction ? a.category.localeCompare(b.category) : a.direction === "raise" ? -1 : 1));
}

/** The three full calendar months before `now`'s month, oldest first. */
export function lastFullMonths(now: Date) {
  return [3, 2, 1].map((back) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 7));
}

@Injectable()
export class BudgetSuggestionsService {
  private readonly logger = new Logger(BudgetSuggestionsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly budgets: BudgetsService,
    private readonly memory: MemwalService,
    private readonly fx: FxService,
    private readonly currencies: CurrencyService,
  ) {}

  /**
   * Suggestions from the user's own history, in the user's currency: spending in accounts with
   * another currency is converted at the day's rate, and left out when there's no rate.
   * Without three full months of history there are none.
   */
  async list(address: string, now = new Date()) {
    const db = this.database.db;
    const months = lastFullMonths(now);
    const from = `${months[0]}-01`;
    const thisMonth = now.toISOString().slice(0, 7);

    const [{ earliest }] = await db
      .select({ earliest: sql<string | null>`min(${transactions.date})` })
      .from(transactions)
      .where(eq(transactions.userAddress, address));
    if (!earliest || earliest > from) return [];

    const limits = (await db.select().from(budgets).where(eq(budgets.userAddress, address))).map((b) => ({
      category: b.category,
      limit: Number(b.limit),
    }));
    if (limits.length === 0) return [];

    const currency = await this.currencies.forUser(address);
    const { convert } = await this.fx.converterTo(currency);
    const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
    const rows = await db
      .select({ category: transactions.category, month, currency: accounts.currency, spent: sql<string>`sum(-${transactions.amount})` })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.userAddress, address),
          gte(transactions.date, from),
          lt(transactions.date, `${thisMonth}-01`),
          lt(transactions.amount, "0"),
        ),
      )
      .groupBy(transactions.category, month, accounts.currency);
    const spent = new Map<string, number[]>();
    for (const r of rows) {
      const value = convert(Number(r.spent), r.currency);
      if (value === null) continue;
      const list = spent.get(r.category) ?? months.map(() => 0);
      const i = months.indexOf(r.month);
      list[i] = Math.round((list[i] + value) * 100) / 100;
      spent.set(r.category, list);
    }

    const current = await this.budgets.list(address, thisMonth, now);
    const projected = new Map(current.budgets.map((b) => [b.category, b.projected]));

    const recent = await this.recentDecisions(address, now);
    const suppressed = new Set(recent.filter((d) => d.decision === "dismissed").map((d) => `${d.category}:${d.direction}`));
    const decidedIds = new Set(recent.map((d) => d.suggestionId));
    return suggestBudgets({ currency, limits, months, spent, projected, suppressed }).filter((s) => !decidedIds.has(s.id));
  }

  /**
   * Accepts (sets the limit) or dismisses a suggestion that is on offer right now. Deciding the
   * same suggestion again within the window answers 409 instead of writing a second decision.
   */
  async decide(session: Session, id: string, decision: "accepted" | "dismissed", now = new Date()) {
    const db = this.database.db;
    const [previous] = await db
      .select()
      .from(budgetSuggestionDecisions)
      .where(and(eq(budgetSuggestionDecisions.userAddress, session.address), eq(budgetSuggestionDecisions.suggestionId, id)));
    if (previous && previous.decidedAt.getTime() > now.getTime() - SUPPRESS_DAYS * DAY) {
      throw new AppError(HttpStatus.CONFLICT, "already_decided", `You already ${previous.decision} this suggestion.`);
    }

    const suggestion = (await this.list(session.address, now)).find((s) => s.id === id);
    if (!suggestion) throw notFound("Suggestion");

    const budget = decision === "accepted" ? await this.budgets.set(session, suggestion.category as CategoryId, suggestion.to) : null;
    const values = {
      category: suggestion.category,
      direction: suggestion.direction,
      fromLimit: suggestion.from.toFixed(2),
      toLimit: suggestion.to.toFixed(2),
      decision,
      decidedAt: now,
    };
    await db
      .insert(budgetSuggestionDecisions)
      .values({ userAddress: session.address, suggestionId: id, ...values })
      .onConflictDoUpdate({ target: [budgetSuggestionDecisions.userAddress, budgetSuggestionDecisions.suggestionId], set: values });

    const label = suggestion.label.toLowerCase();
    const money = (n: number) => formatMoney(n, suggestion.currency);
    const text =
      decision === "accepted"
        ? `You ${suggestion.direction === "raise" ? "raised" : "lowered"} your ${label} limit from ${money(suggestion.from)} to ${money(suggestion.to)} a month after a Sovra suggestion.`
        : `You kept your ${label} limit at ${money(suggestion.from)}, so Sovra won't suggest ${suggestion.direction === "raise" ? "raising" : "lowering"} it for 3 months.`;
    return { suggestion, decision, budget, memory: await this.rememberSafely(session.address, text) };
  }

  private recentDecisions(address: string, now: Date) {
    return this.database.db
      .select()
      .from(budgetSuggestionDecisions)
      .where(
        and(
          eq(budgetSuggestionDecisions.userAddress, address),
          gte(budgetSuggestionDecisions.decidedAt, new Date(now.getTime() - SUPPRESS_DAYS * DAY)),
        ),
      );
  }

  private async rememberSafely(address: string, text: string) {
    if (!(await this.memory.availableFor(address))) return { status: "skipped" as const, text, reason: "not_configured" };
    try {
      await this.memory.remember(address, { kind: "decision", text, source: "You answered a suggestion" });
      return { status: "saved" as const, text };
    } catch (err) {
      this.logger.warn(`Suggestion memory failed: ${err instanceof Error ? err.message : String(err)}`);
      return { status: "failed" as const, text };
    }
  }
}

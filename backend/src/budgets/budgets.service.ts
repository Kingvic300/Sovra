import { Injectable } from "@nestjs/common";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Session } from "../auth/session.js";
import { notFound } from "../common/errors.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, budgets, transactions, users } from "../database/schema.js";
import { CurrencyService } from "../fx/currency.service.js";
import { FxService } from "../fx/fx.service.js";
import { RecurringService, expectedDates } from "../recurring/recurring.module.js";
import { CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import { monthRange } from "../transactions/transactions.service.js";

export const currentMonth = () => new Date().toISOString().slice(0, 7);
const cents = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class BudgetsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fx: FxService,
    private readonly currencies: CurrencyService,
    private readonly recurring: RecurringService,
  ) {}

  /**
   * Limits for each category with what has been spent in `month`, in the user's currency, plus
   * `committed`: active recurring charges still expected before the month ends (paused ones don't
   * count), already converted to the user's currency. `projected` is spent + committed. Months
   * that have already ended have nothing committed. Spending in accounts with another currency is
   * converted at the day's rate; without a rate it can't be compared with the limit, so it is left
   * out and counted in `unconverted`.
   */
  async list(address: string, month: string, now = new Date()) {
    const db = this.database.db;
    const { from, to } = monthRange(month);
    const currency = await this.currencies.forUser(address);
    const { convert } = await this.fx.converterTo(currency);
    const today = now.toISOString().slice(0, 10);
    const renewals = new Map<string, { id: string; merchant: string; amount: number; date: string }[]>();
    if (to > today) {
      for (const r of await this.recurring.active(address)) {
        for (const date of expectedDates(r, from, to)) {
          const list = renewals.get(r.category) ?? [];
          list.push({ id: r.id, merchant: r.merchant, amount: r.amount, date });
          renewals.set(r.category, list);
        }
      }
    }
    const limits = await db.select().from(budgets).where(eq(budgets.userAddress, address));
    const spentRows = await db
      .select({
        category: transactions.category,
        currency: accounts.currency,
        spent: sql<string>`coalesce(sum(-${transactions.amount}), 0)`,
      })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.userAddress, address),
          gte(transactions.date, from),
          lt(transactions.date, to),
          lt(transactions.amount, "0"),
        ),
      )
      .groupBy(transactions.category, accounts.currency);
    const spent = new Map<string, number>();
    let unconverted = 0;
    for (const r of spentRows) {
      const value = convert(Number(r.spent), r.currency);
      if (value === null) unconverted++;
      else spent.set(r.category, Math.round(((spent.get(r.category) ?? 0) + value) * 100) / 100);
    }

    return {
      month,
      currency,
      unconverted,
      budgets: limits.map((b) => {
        const used = spent.get(b.category) ?? 0;
        const due = (renewals.get(b.category) ?? []).sort((x, y) => x.date.localeCompare(y.date));
        const committed = cents(due.reduce((sum, r) => sum + r.amount, 0));
        return {
          category: b.category,
          label: CATEGORY_LABELS[b.category as CategoryId] ?? b.category,
          limit: Number(b.limit),
          spent: used,
          committed,
          projected: cents(used + committed),
          renewals: due,
        };
      }),
    };
  }

  async set(session: Session, category: CategoryId, limit: number) {
    const db = this.database.db;
    await db.insert(users).values({ address: session.address, method: session.method, name: session.name }).onConflictDoNothing();
    const [row] = await db
      .insert(budgets)
      .values({ userAddress: session.address, category, limit: limit.toFixed(2) })
      .onConflictDoUpdate({ target: [budgets.userAddress, budgets.category], set: { limit: limit.toFixed(2) } })
      .returning();
    return { category: row.category, limit: Number(row.limit) };
  }

  async remove(address: string, category: CategoryId) {
    const deleted = await this.database.db
      .delete(budgets)
      .where(and(eq(budgets.userAddress, address), eq(budgets.category, category)))
      .returning();
    if (deleted.length === 0) throw notFound("Budget");
    return { category, deleted: true };
  }
}

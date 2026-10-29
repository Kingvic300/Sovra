import { Body, Controller, Delete, Get, Injectable, Module, Param, Put, Query, UseGuards } from "@nestjs/common";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { notFound } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, budgets, transactions, users } from "../database/schema.js";
import { CurrencyService } from "../fx/currency.service.js";
import { FxService } from "../fx/fx.service.js";
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import { monthRange } from "../transactions/transactions.service.js";

const currentMonth = () => new Date().toISOString().slice(0, 7);

@Injectable()
export class BudgetsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fx: FxService,
    private readonly currencies: CurrencyService,
  ) {}

  /**
   * Limits for each category with what has been spent in `month`, in the user's currency.
   * Spending in accounts with another currency is converted at the day's rate; without a rate it
   * can't be compared with the limit, so it is left out and counted in `unconverted`.
   */
  async list(address: string, month: string) {
    const db = this.database.db;
    const { from, to } = monthRange(month);
    const currency = await this.currencies.forUser(address);
    const { convert } = await this.fx.converterTo(currency);
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
      budgets: limits.map((b) => ({
        category: b.category,
        label: CATEGORY_LABELS[b.category as CategoryId] ?? b.category,
        limit: Number(b.limit),
        spent: spent.get(b.category) ?? 0,
      })),
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

const MonthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM").optional() });
const CategoryParam = z.enum(CATEGORY_IDS);
const LimitBody = z.object({ limit: z.number().positive().max(10_000_000) });

@Controller("budgets")
@UseGuards(SessionGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@CurrentSession() s: Session, @Query(new ZodPipe(MonthQuery)) q: z.infer<typeof MonthQuery>) {
    return this.budgets.list(s.address, q.month ?? currentMonth());
  }

  @Put(":category")
  set(
    @CurrentSession() s: Session,
    @Param("category", new ZodPipe(CategoryParam)) category: CategoryId,
    @Body(new ZodPipe(LimitBody)) body: z.infer<typeof LimitBody>,
  ) {
    return this.budgets.set(s, category, body.limit);
  }

  @Delete(":category")
  remove(@CurrentSession() s: Session, @Param("category", new ZodPipe(CategoryParam)) category: CategoryId) {
    return this.budgets.remove(s.address, category);
  }
}

@Module({ controllers: [BudgetsController], providers: [BudgetsService], exports: [BudgetsService] })
export class BudgetsModule {}

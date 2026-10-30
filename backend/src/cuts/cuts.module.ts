import { Body, Controller, HttpCode, Inject, Injectable, Logger, Module, Post, UseGuards } from "@nestjs/common";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { AiModule } from "../ai/ai.module.js";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider.js";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { BudgetsModule, BudgetsService } from "../budgets/budgets.module.js";
import { AppError } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, transactions } from "../database/schema.js";
import { FxService } from "../fx/fx.service.js";
import { GoalsModule, GoalsService } from "../goals/goals.module.js";
import { MemoryModule } from "../memory/memory.module.js";
import { MemwalService } from "../memory/memwal.service.js";
import { RecurringModule, RecurringService } from "../recurring/recurring.module.js";
import { RateLimit } from "../security/rate-limit.js";
import { CATEGORY_IDS } from "../shared/categories.js";
import { formatMoney } from "../shared/currency.js";
import { monthRange } from "../transactions/transactions.service.js";
import {
  HABIT_DAYS,
  applyPicks,
  biggestThisMonth,
  candidatesFor,
  outcome,
  rulePlan,
  type CutCandidate,
  type CutTarget,
  type HabitRow,
  type KeptPick,
} from "./cut-plan.js";

const DAY = 86_400_000;
const MEMORY_LIMIT = 6;

const PlanBody = z.object({ category: z.enum(CATEGORY_IDS).optional() });

@Injectable()
export class CutsService {
  private readonly logger = new Logger(CutsService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly database: DatabaseService,
    private readonly budgets: BudgetsService,
    private readonly recurring: RecurringService,
    private readonly goals: GoalsService,
    private readonly memory: MemwalService,
    private readonly fx: FxService,
  ) {}

  /**
   * What to cut so that `category` (or every category projected over its limit) ends the month
   * under budget. The AI model chooses among candidates built from the user's data and explains each
   * cut; without it, or when it fails, simple rules choose. Nothing is changed: the user acts on each cut.
   */
  async plan(session: Session, category?: string, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const monthEnd = new Date(Date.parse(monthRange(month).to) - DAY).toISOString().slice(0, 10);
    const { currency, budgets } = await this.budgets.list(session.address, month, now);

    const over = budgets.filter((b) => b.projected > b.limit && (!category || b.category === category));
    const targets: CutTarget[] = over.map((b) => ({
      category: b.category,
      label: b.label,
      limit: b.limit,
      projected: b.projected,
      over: Math.round((b.projected - b.limit) * 100) / 100,
    }));
    const empty = { month, currency, by: null, model: null, cuts: [], kept: [], usedMemories: [], ...outcome(targets, []) };
    if (!targets.length) {
      const budget = category ? budgets.find((b) => b.category === category) : undefined;
      const summary =
        category && !budget
          ? "There's no budget for that category yet. Add a limit first, then Sovra can suggest what to cut."
          : budget
            ? `${budget.label} is on track: ${formatMoney(budget.projected, currency)} of ${formatMoney(budget.limit, currency)} with renewals counted.`
            : "Every budget is on track this month, so there's nothing to cut.";
      return { ...empty, status: "on_track" as const, summary };
    }

    const candidates = await this.candidates(session.address, targets, budgets, today, monthEnd, currency, now);
    if (!candidates.length) {
      return { ...empty, status: "nothing_to_cut" as const, summary: nextMonthSummary(targets, currency) };
    }

    const merchants = [...new Set(candidates.map((c) => c.merchant))].slice(0, 8);
    const [recalled, goals] = await Promise.all([
      this.recall(session.address, `What matters to me about ${targets.map((t) => t.label).join(", ")} spending, and ${merchants.join(", ")}`),
      this.goals.list(session.address).catch(() => []),
    ]);
    const memoryTexts = recalled.map((m) => m.text);

    let by: "ai" | "rules" = "rules";
    let model: string | null = null;
    let summary: string | null = null;
    let note: string | null = null;
    let picks = rulePlan(targets, candidates, memoryTexts, currency);
    if (this.ai.configured) {
      try {
        const result = await this.ai.planCuts({
          currency,
          today,
          targets,
          candidates,
          memories: memoryTexts,
          goals: goals.map(({ name, target, saved, due }) => ({ name, target, saved, due })),
        });
        picks = { picks: result.cuts, kept: result.kept };
        by = "ai";
        model = result.model;
        summary = result.summary || null;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        this.logger.warn(`Cut plan fell back to rules: ${err.message}`);
        note = "Sovra's AI model didn't answer, so these cuts come from simple rules.";
      }
    }

    const cuts = applyPicks(candidates, picks.picks, memoryTexts);
    const result = outcome(targets, cuts);
    return {
      month,
      currency,
      status: "planned" as const,
      by,
      model,
      summary: summary ?? ruleSummary(result, targets, currency),
      note,
      cuts,
      kept: keptMerchants(candidates, picks.kept, cuts),
      usedMemories: recalled.map((m) => ({ id: m.id, text: m.text })),
      ...result,
    };
  }

  private async candidates(
    address: string,
    targets: CutTarget[],
    budgets: Awaited<ReturnType<BudgetsService["list"]>>["budgets"],
    today: string,
    monthEnd: string,
    currency: string,
    now: Date,
  ): Promise<CutCandidate[]> {
    const categories = targets.map((t) => t.category);
    const [rows, recurring, { convert }] = await Promise.all([
      this.database.db
        .select({
          date: transactions.date,
          merchant: transactions.merchant,
          merchantKey: transactions.merchantKey,
          category: transactions.category,
          amount: transactions.amount,
          currency: accounts.currency,
        })
        .from(transactions)
        .leftJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(
          and(
            eq(transactions.userAddress, address),
            inArray(transactions.category, categories),
            gte(transactions.date, new Date(now.getTime() - HABIT_DAYS * DAY).toISOString().slice(0, 10)),
            lt(transactions.amount, "0"),
          ),
        )
        .orderBy(transactions.date),
      this.recurring.list(address, now),
      this.fx.converterTo(currency),
    ]);
    // Habits in a currency with no rate today can't be compared with the limit, so they're left out.
    const habits = rows.flatMap((r): HabitRow[] => {
      const amount = convert(Number(r.amount), r.currency);
      return amount === null ? [] : [{ ...r, amount }];
    });
    const recurringKeys = new Set(recurring.map((r) => r.merchantKey));
    for (const t of targets) t.biggestThisMonth = biggestThisMonth(habits.filter((h) => h.category === t.category), today.slice(0, 7));
    return targets.flatMap((t) =>
      candidatesFor({
        category: t.category,
        today,
        monthEnd,
        renewals: budgets.find((b) => b.category === t.category)?.renewals ?? [],
        habits: habits.filter((h) => h.category === t.category),
        recurringKeys,
      }),
    );
  }

  /** Memories that bear on the cuts. Best effort: a plan without them is still useful. */
  private async recall(address: string, query: string) {
    try {
      if (!(await this.memory.availableFor(address))) return [];
      return await this.memory.recall(address, query, MEMORY_LIMIT);
    } catch (err) {
      this.logger.warn(`Cut plan memory recall failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}

function ruleSummary(result: ReturnType<typeof outcome>, targets: CutTarget[], currency: string) {
  const parts = result.targets.map((t) => `${t.label} ends at ${formatMoney(t.after, currency)} of ${formatMoney(t.limit, currency)}`);
  return result.closesGap
    ? `With these cuts, ${parts.join(", ")}.`
    : `Even with these cuts, ${parts.join(", ")}. ${nextMonthSummary(targets.filter((t) => result.targets.some((r) => r.category === t.category && r.after > r.limit)), currency)}`;
}

/** For categories this month can't fix any more: where the money went, to cut back on next month. */
function nextMonthSummary(targets: CutTarget[], currency: string) {
  const tips = targets.flatMap((t) => {
    const top = t.biggestThisMonth?.[0];
    return top ? [`${t.label.toLowerCase()}: ${top.merchant} (${formatMoney(top.spent, currency)} over ${top.times} ${top.times === 1 ? "payment" : "payments"})`] : [];
  });
  return `Most of this month's spending has already happened, so there's little left to cut.${tips.length ? ` To stay under next month, start with ${tips.join("; ")}.` : ""}`;
}

/** Kept items named by merchant, leaving out anything the plan also cuts. */
function keptMerchants(candidates: CutCandidate[], kept: KeptPick[], cuts: { id: string }[]) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const cut = new Set(cuts.map((c) => c.id));
  const seen = new Set<string>();
  return kept.flatMap((k) => {
    const c = byId.get(k.id);
    if (!c || cut.has(c.id) || seen.has(c.id)) return [];
    seen.add(c.id);
    return [{ id: c.id, merchant: c.merchant, category: c.category, why: k.why.trim().slice(0, 300) }];
  });
}

@Controller("budgets/cuts")
@UseGuards(SessionGuard)
export class CutsController {
  constructor(private readonly cuts: CutsService) {}

  /** `{category?}` → which renewals to pause and which habits to cut back on to stay under budget. */
  @Post()
  @HttpCode(200)
  @RateLimit("ask")
  plan(@CurrentSession() s: Session, @Body(new ZodPipe(PlanBody)) body: z.infer<typeof PlanBody>) {
    return this.cuts.plan(s, body.category);
  }
}

@Module({
  imports: [AiModule, BudgetsModule, GoalsModule, MemoryModule, RecurringModule],
  controllers: [CutsController],
  providers: [CutsService],
})
export class CutsModule {}

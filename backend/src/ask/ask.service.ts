import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider.js";
import type { Session } from "../auth/session.js";
import { notConfigured } from "../common/errors.js";
import { BudgetsService } from "../budgets/budgets.module.js";
import { DatabaseService } from "../database/database.service.js";
import { profiles } from "../database/schema.js";
import { GoalsService } from "../goals/goals.module.js";
import { MemwalService } from "../memory/memwal.service.js";
import { RecurringService } from "../recurring/recurring.module.js";
import { TransactionsService } from "../transactions/transactions.service.js";
import { TatumService } from "../wallet/tatum.service.js";

const MEMORY_LIMIT = 6;
const RECENT_TRANSACTIONS = 15;
const UPCOMING_DAYS = 30;

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly memory: MemwalService,
    private readonly database: DatabaseService,
    private readonly budgets: BudgetsService,
    private readonly goals: GoalsService,
    private readonly recurring: RecurringService,
    private readonly transactions: TransactionsService,
    private readonly tatum: TatumService,
  ) {}

  /**
   * Answers from the user's own data. Every source is optional: whatever fails or isn't
   * configured is listed as missing so the model can say so instead of guessing.
   */
  async ask(session: Session, question: string) {
    if (!this.ai.configured) throw notConfigured("Ask Sovra (GROQ_API_KEY)");

    const missing: string[] = [];
    const context: Record<string, unknown> = {};
    const month = new Date().toISOString().slice(0, 7);

    const attempt = async <T>(label: string, available: boolean, load: () => Promise<T>): Promise<T | undefined> => {
      if (!available) {
        missing.push(label);
        return undefined;
      }
      try {
        return await load();
      } catch (err) {
        this.logger.warn(`Ask context "${label}" failed: ${err instanceof Error ? err.message : String(err)}`);
        missing.push(label);
        return undefined;
      }
    };

    const db = this.database.available;
    const [memories, profile, budgets, goals, recent, upcoming, wallet] = await Promise.all([
      attempt("memories", await this.memory.availableFor(session.address), () =>
        this.memory.recall(session.address, question, MEMORY_LIMIT),
      ),
      attempt("profile", db, async () => {
        const [p] = await this.database.db.select().from(profiles).where(eq(profiles.userAddress, session.address));
        return p ? { name: p.name, payday: p.payday ?? undefined } : undefined;
      }),
      attempt("budgets", db, () => this.budgets.list(session.address, month)),
      attempt("goals", db, () => this.goals.list(session.address)),
      attempt("recent transactions", db, () =>
        this.transactions.list(session.address, { month, limit: RECENT_TRANSACTIONS }),
      ),
      attempt("upcoming bills", db, async () => {
        const horizon = new Date(Date.now() + UPCOMING_DAYS * 86_400_000).toISOString().slice(0, 10);
        return (await this.recurring.list(session.address)).filter((r) => r.nextDate <= horizon);
      }),
      attempt("Sui wallet balance", this.tatum.configured, () => this.tatum.getUsdcBalance(session.address)),
    ]);

    if (profile) context.profile = profile;
    if (wallet) context.suiWalletUsdc = wallet.usdc;
    if (budgets) context.budgetsThisMonth = budgets.budgets.map(({ label, limit, spent }) => ({ label, limit, spent }));
    if (goals) context.goals = goals.map(({ name, target, saved, due, weekly }) => ({ name, target, saved, due, weekly }));
    if (recent) {
      context.recentTransactions = recent.map(({ date, merchant, category, amount }) => ({ date, merchant, category, amount }));
    }
    if (upcoming) {
      context.upcomingBills = upcoming.map(({ merchant, amount, nextDate, cadence }) => ({ merchant, amount, nextDate, cadence }));
    }

    const used = memories ?? [];
    const { text, model } = await this.ai.answer({
      question,
      context,
      memories: used.map((m) => ({ kind: m.kind, text: m.text })),
      missing,
    });

    return {
      answer: text,
      usedMemories: used.map((m) => ({ id: m.id, text: m.text })),
      model,
    };
  }
}

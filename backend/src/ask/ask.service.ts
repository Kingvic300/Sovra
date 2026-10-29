import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider.js";
import type { Session } from "../auth/session.js";
import { badRequest, notConfigured } from "../common/errors.js";
import { BudgetsService } from "../budgets/budgets.module.js";
import { DatabaseService } from "../database/database.service.js";
import { askMessages, profiles } from "../database/schema.js";
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
        // Paused charges are ones the user told Sovra to stop counting.
        return (await this.recurring.active(session.address)).filter((r) => r.nextDate <= horizon);
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

    const usedMemories = used.map((m) => ({ id: m.id, text: m.text }));
    const saved = await this.saveToHistory(session.address, { question, answer: text, usedMemories, model });
    return {
      answer: text,
      usedMemories,
      model,
      id: saved?.id ?? null,
      createdAt: saved?.createdAt.toISOString() ?? null,
    };
  }

  /**
   * Keeps an answered question. Only answers that came back are saved (failures throw before this),
   * and a failed save never costs the user the answer they already waited for.
   */
  private async saveToHistory(address: string, message: { question: string; answer: string; usedMemories: { id: string | null; text: string }[]; model: string }) {
    if (!this.database.available) return null;
    try {
      const [row] = await this.database.db
        .insert(askMessages)
        .values({ userAddress: address, ...message })
        .returning({ id: askMessages.id, createdAt: askMessages.createdAt });
      return row;
    } catch (err) {
      this.logger.warn(`Could not save Ask history: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * The user's questions and answers, newest first. `before` is the id of the oldest message
   * already shown; the comparison runs in Postgres so timestamps keep their full precision.
   */
  async history(address: string, page: { limit: number; before?: string }) {
    const db = this.database.db;
    const conditions = [eq(askMessages.userAddress, address)];
    if (page.before) {
      const [anchor] = await db
        .select({ id: askMessages.id })
        .from(askMessages)
        .where(and(eq(askMessages.id, page.before), eq(askMessages.userAddress, address)));
      if (!anchor) throw badRequest("That page of history no longer exists. Reload to start again.", "invalid_cursor");
      conditions.push(
        sql`(${askMessages.createdAt}, ${askMessages.id}) < (select created_at, id from ask_messages where id = ${page.before})`,
      );
    }
    const rows = await db
      .select()
      .from(askMessages)
      .where(and(...conditions))
      .orderBy(desc(askMessages.createdAt), desc(askMessages.id))
      .limit(page.limit + 1);
    const messages = rows.slice(0, page.limit).map((m) => ({
      id: m.id,
      question: m.question,
      answer: m.answer,
      usedMemories: m.usedMemories,
      model: m.model,
      createdAt: m.createdAt.toISOString(),
    }));
    return { messages, nextCursor: rows.length > page.limit ? messages[messages.length - 1].id : null };
  }

  async clearHistory(address: string) {
    const deleted = await this.database.db.delete(askMessages).where(eq(askMessages.userAddress, address)).returning({ id: askMessages.id });
    return { deleted: deleted.length };
  }
}

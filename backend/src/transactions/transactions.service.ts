import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider.js";
import { notFound } from "../common/errors.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, categoryRules, transactions, users } from "../database/schema.js";
import { MemwalService } from "../memory/memwal.service.js";
import type { Session } from "../auth/session.js";
import type { CategoryId } from "../shared/categories.js";
import { categoryRuleSentence } from "../shared/memory-text.js";
import { CsvService, type DateOrder, type ParsedRow } from "./csv.service.js";

const toApi = (t: typeof transactions.$inferSelect) => ({
  id: t.id,
  date: t.date,
  merchant: t.merchant,
  category: t.category,
  amount: Number(t.amount),
  accountId: t.accountId,
  learnedFrom: t.learnedFromMemoryId ?? undefined,
});

/** "2026-10" → [2026-10-01, 2026-11-01) */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly csv: CsvService,
    private readonly memory: MemwalService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async list(address: string, filter: { month?: string; category?: string; limit: number }) {
    const conditions = [eq(transactions.userAddress, address)];
    if (filter.month) {
      const { from, to } = monthRange(filter.month);
      conditions.push(gte(transactions.date, from), lt(transactions.date, to));
    }
    if (filter.category) conditions.push(eq(transactions.category, filter.category));
    const rows = await this.database.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(filter.limit);
    return rows.map(toApi);
  }

  private async rules(address: string) {
    const rows = await this.database.db.select().from(categoryRules).where(eq(categoryRules.userAddress, address));
    return new Map(rows.map((r) => [r.merchantKey, r.category as CategoryId]));
  }

  /** Parses a statement. With `preview`, nothing is saved. */
  async importCsv(
    session: Session,
    file: { content: string; filename: string },
    options: { preview: boolean; accountName?: string; dateOrder?: DateOrder },
  ) {
    const rules = this.database.available ? await this.rules(session.address) : new Map<string, CategoryId>();
    const parsed = this.csv.parse(file.content, rules, options.dateOrder);
    const preview = parsed.rows.slice(0, 20).map(({ raw: _raw, line: _line, ...row }) => row);

    if (options.preview) {
      return { preview: true, columns: parsed.columns, dateOrder: parsed.dateOrder, total: parsed.rows.length, rows: preview, skipped: parsed.skipped };
    }

    const db = this.database.db;
    const categorizedBy = await this.refineCategories(parsed.rows);
    await db.insert(users).values({ address: session.address, method: session.method, name: session.name }).onConflictDoNothing();
    const [account] = await db
      .insert(accounts)
      .values({
        userAddress: session.address,
        kind: "csv",
        name: options.accountName?.trim() || file.filename.replace(/\.csv$/i, ""),
        syncedAt: new Date(),
      })
      .returning();

    const BATCH = 500;
    for (let i = 0; i < parsed.rows.length; i += BATCH) {
      await db.insert(transactions).values(
        parsed.rows.slice(i, i + BATCH).map((r) => ({
          userAddress: session.address,
          accountId: account.id,
          date: r.date,
          merchant: r.merchant,
          merchantKey: r.merchantKey,
          amount: r.amount.toFixed(2),
          category: r.category,
          raw: r.raw,
        })),
      );
    }

    return {
      preview: false,
      account: { id: account.id, name: account.name, kind: account.kind },
      imported: parsed.rows.length,
      learnedApplied: categorizedBy.rules,
      categorizedBy,
      skipped: parsed.skipped,
    };
  }

  /**
   * Learned rules win. Other merchants go to the AI model once each (by merchant key) when Groq
   * is configured; anything it skips or fails on keeps its keyword guess or "uncategorized".
   */
  private async refineCategories(rows: ParsedRow[]) {
    const counts = { rules: 0, ai: 0, keywords: 0 };
    const pending = new Map<string, { merchantKey: string; example: string; amount: number }>();
    for (const r of rows) {
      if (r.learned) continue;
      if (!pending.has(r.merchantKey)) pending.set(r.merchantKey, { merchantKey: r.merchantKey, example: r.merchant, amount: r.amount });
    }

    const fromAi = this.ai.configured && pending.size ? await this.ai.categorize([...pending.values()]) : new Map<string, CategoryId>();
    for (const r of rows) {
      if (r.learned) counts.rules++;
      else if (fromAi.has(r.merchantKey)) {
        r.category = fromAi.get(r.merchantKey)!;
        counts.ai++;
      } else counts.keywords++;
    }
    return counts;
  }

  /**
   * Changes a transaction's category. With `remember`, Sovra saves a rule for the merchant,
   * recategorises that merchant's other transactions and writes the rule to Walrus Memory.
   */
  async updateCategory(address: string, id: string, input: { category: CategoryId; remember: boolean }) {
    const db = this.database.db;
    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userAddress, address)));
    if (!tx) throw notFound("Transaction");

    if (!input.remember) {
      const [updated] = await db
        .update(transactions)
        .set({ category: input.category, learnedFromMemoryId: null })
        .where(eq(transactions.id, id))
        .returning();
      return { transaction: toApi(updated), recategorized: 0, memory: null };
    }

    let memoryId: string | null = null;
    let memory: { status: "saved" | "skipped" | "failed"; text: string; reason?: string };
    const text = categoryRuleSentence(tx.merchant, input.category);
    if (!this.memory.configured) {
      memory = { status: "skipped", text, reason: "not_configured" };
    } else {
      try {
        memoryId = (await this.memory.remember(address, { kind: "correction", text, source: "You edited a transaction" })).id;
        memory = { status: "saved", text };
      } catch (err) {
        this.logger.warn(`Rule memory failed: ${err instanceof Error ? err.message : String(err)}`);
        memory = { status: "failed", text };
      }
    }

    await db
      .insert(categoryRules)
      .values({ userAddress: address, merchantKey: tx.merchantKey, category: input.category, memoryId })
      .onConflictDoUpdate({
        target: [categoryRules.userAddress, categoryRules.merchantKey],
        set: { category: input.category, memoryId },
      });

    const updated = await db
      .update(transactions)
      .set({ category: input.category, learnedFromMemoryId: memoryId })
      .where(and(eq(transactions.userAddress, address), eq(transactions.merchantKey, tx.merchantKey)))
      .returning();

    const self = updated.find((t) => t.id === id) ?? tx;
    return { transaction: toApi(self), recategorized: updated.length - 1, memory };
  }
}

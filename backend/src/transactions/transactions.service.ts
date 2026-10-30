import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider.js";
import { badRequest, notFound } from "../common/errors.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, categoryRules, transactions, users } from "../database/schema.js";
import { MemwalService } from "../memory/memwal.service.js";
import type { Session } from "../auth/session.js";
import type { CategoryId } from "../shared/categories.js";
import { detectCurrency } from "../shared/currency.js";
import { categoryRuleSentence } from "../shared/memory-text.js";
import { CurrencyService } from "../fx/currency.service.js";
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

/** "Wallet Account Transactions" → "Wallet Account". Falls back when the sheet has no useful name. */
export function accountNameForSheet(sheet: string | null, fallback: string) {
  const name = (sheet ?? "").replace(/\s+(transactions?|statement|history)$/i, "").trim();
  return !name || /^sheet\s*\d*$/i.test(name) ? fallback : name.slice(0, 80);
}

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
    private readonly currencies: CurrencyService,
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

  /**
   * Parses a statement and, unless `preview`, saves it. A workbook with several sheets becomes one
   * account per sheet (for example "Wallet Account" and "Savings Account").
   */
  async importCsv(
    session: Session,
    file: { sheets: { name: string | null; content: string }[]; filename: string },
    options: { preview: boolean; accountName?: string; dateOrder?: DateOrder; currency?: string },
  ) {
    const rules = this.database.available ? await this.rules(session.address) : new Map<string, CategoryId>();
    const userCurrency = await this.currencies.forUser(session.address);
    const base = options.accountName?.trim() || file.filename.replace(/\.(csv|xlsx|pdf)$/i, "");
    const many = file.sheets.length > 1;
    const parsedSheets = file.sheets
      .map((sheet, i) => {
        const parsed = this.csv.parse(sheet.content, rules, options.dateOrder);
        // "Debit(₦)" or "₦1,250.00" says what currency the sheet is in; otherwise assume the user's.
        const moneyColumns = [parsed.columns.amount, parsed.columns.debit, parsed.columns.credit, parsed.columns.balance];
        const samples = parsed.rows.slice(0, 10).flatMap((r) => moneyColumns.map((c) => (c ? (r.raw[c] ?? "") : "")));
        const detected = detectCurrency(Object.values(parsed.columns).filter((c): c is string => !!c), samples);
        return {
          name: many ? accountNameForSheet(sheet.name, `${base} ${i + 1}`) : base,
          parsed,
          detectedCurrency: detected,
          currency: options.currency ?? detected ?? userCurrency,
        };
      })
      // A sheet whose rows are all unreadable shouldn't become an empty account; keep at least one so errors show.
      .filter((s, i, all) => s.parsed.rows.length > 0 || (i === 0 && all.every((x) => x.parsed.rows.length === 0)));
    const allRows = parsedSheets.flatMap((s) => s.parsed.rows);
    const skipped = parsedSheets.flatMap((s) => (many ? s.parsed.skipped.map((k) => ({ ...k, sheet: s.name })) : s.parsed.skipped));
    const first = parsedSheets[0].parsed;
    const summaries = parsedSheets.map((s) => ({
      name: s.name,
      total: s.parsed.rows.length,
      closingBalance: s.parsed.closingBalance,
      currency: s.currency,
      detectedCurrency: s.detectedCurrency,
    }));

    if (options.preview) {
      return {
        preview: true,
        columns: first.columns,
        dateOrder: first.dateOrder,
        total: allRows.length,
        closingBalance: many ? null : first.closingBalance,
        currency: parsedSheets[0].currency,
        userCurrency,
        accounts: summaries,
        rows: allRows.slice(0, 20).map(({ raw: _raw, line: _line, ...row }) => row),
        skipped,
      };
    }

    if (allRows.length === 0) {
      throw badRequest("No transactions could be read from that statement, so nothing was imported.", "no_transactions");
    }
    const db = this.database.db;
    // Demo accounts get keyword categories only, so a public demo can't run up AI costs.
    // All sheets are categorized together so a merchant seen in two of them is sent once.
    const categorizedBy = await this.refineCategories(allRows, session.method !== "demo");
    await db.insert(users).values({ address: session.address, method: session.method, name: session.name }).onConflictDoNothing();

    const existingAccounts = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userAddress, session.address), eq(accounts.kind, "csv")));

    const saved: {
      id: string;
      name: string;
      kind: string;
      balance: number | null;
      currency: string;
      imported: number;
      alreadyImported: number;
    }[] = [];
    for (const sheet of parsedSheets) {
      // Importing a statement into an account with the same name adds to that account instead of
      // creating a second one, and rows that are already there are skipped, so an overlapping or
      // repeated export never counts money twice.
      const match = existingAccounts.find((a) => a.name.trim().toLowerCase() === sheet.name.trim().toLowerCase());
      const rows = match ? await this.withoutAlreadyImported(match.id, sheet.parsed.rows) : sheet.parsed.rows;
      const latest = sheet.parsed.rows.reduce((max, r) => (r.date > max ? r.date : max), "");
      const lastKnown = match ? await this.lastTransactionDate(match.id) : null;
      // An older statement imported later must not overwrite a newer balance.
      const balanceIsCurrent = sheet.parsed.closingBalance != null && (!lastKnown || latest >= lastKnown);
      const [account] = match
        ? await db
            .update(accounts)
            .set({
              syncedAt: new Date(),
              ...(balanceIsCurrent ? { balance: sheet.parsed.closingBalance!.toFixed(2) } : {}),
            })
            .where(eq(accounts.id, match.id))
            .returning()
        : await db
            .insert(accounts)
            .values({
              userAddress: session.address,
              kind: "csv",
              name: sheet.name,
              currency: sheet.currency,
              balance: sheet.parsed.closingBalance == null ? null : sheet.parsed.closingBalance.toFixed(2),
              syncedAt: new Date(),
            })
            .returning();

      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        await db.insert(transactions).values(
          rows.slice(i, i + BATCH).map((r) => ({
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
      saved.push({
        id: account.id,
        name: account.name,
        kind: account.kind,
        balance: account.balance == null ? null : Number(account.balance),
        currency: account.currency ?? sheet.currency,
        imported: rows.length,
        alreadyImported: sheet.parsed.rows.length - rows.length,
      });
    }

    const { imported: _imported, alreadyImported: _already, ...firstAccount } = saved[0];
    return {
      preview: false,
      account: firstAccount,
      accounts: saved,
      imported: saved.reduce((n, a) => n + a.imported, 0),
      alreadyImported: saved.reduce((n, a) => n + a.alreadyImported, 0),
      learnedApplied: categorizedBy.rules,
      categorizedBy,
      skipped,
    };
  }

  /**
   * Drops rows the account already holds (same date, amount and description). Counts are kept per
   * key, so two identical coffees on one day still import when only one of them is already saved.
   */
  private async withoutAlreadyImported(accountId: string, rows: ParsedRow[]) {
    if (rows.length === 0) return rows;
    const dates = rows.map((r) => r.date).sort();
    const existing = await this.database.db
      .select({ date: transactions.date, amount: transactions.amount, merchant: transactions.merchant })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          gte(transactions.date, dates[0]),
          lte(transactions.date, dates[dates.length - 1]),
        ),
      );
    const key = (date: string, amount: number, merchant: string) => `${date}|${amount.toFixed(2)}|${merchant.trim().toLowerCase()}`;
    const left = new Map<string, number>();
    for (const t of existing) {
      const k = key(t.date, Number(t.amount), t.merchant);
      left.set(k, (left.get(k) ?? 0) + 1);
    }
    return rows.filter((r) => {
      const k = key(r.date, r.amount, r.merchant);
      const n = left.get(k) ?? 0;
      if (n === 0) return true;
      left.set(k, n - 1);
      return false;
    });
  }

  private async lastTransactionDate(accountId: string) {
    const [row] = await this.database.db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(transactions.date))
      .limit(1);
    return row?.date ?? null;
  }

  /**
   * Learned rules win. Other merchants go to the AI model once each (by merchant key) when Groq
   * is configured; anything it skips or fails on keeps its keyword guess or "uncategorized".
   */
  private async refineCategories(rows: ParsedRow[], useAi: boolean) {
    const counts = { rules: 0, ai: 0, keywords: 0 };
    const pending = new Map<string, { merchantKey: string; example: string; amount: number }>();
    for (const r of rows) {
      if (r.learned) continue;
      if (!pending.has(r.merchantKey)) pending.set(r.merchantKey, { merchantKey: r.merchantKey, example: r.merchant, amount: r.amount });
    }

    const fromAi =
      useAi && this.ai.configured && pending.size ? await this.ai.categorize([...pending.values()]) : new Map<string, CategoryId>();
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
    if (!(await this.memory.availableFor(address))) {
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

import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Session } from "../auth/session.js";
import { AppError, conflict, notConfigured } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, categoryRules, transactions, users } from "../database/schema.js";
import type { CategoryId } from "../shared/categories.js";
import { TatumService, type UsdcTransfer } from "./tatum.service.js";

const PAGE_SIZE = 50;

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** Merchant key for a counterparty, so learned rules and recurring detection work per address. */
export const suiMerchantKey = (counterparty: string | null) => `sui:${counterparty ? counterparty.toLowerCase() : "unknown"}`;

type Counts = { imported: number; alreadyImported: number; failed: number; undated: number; dust: number };

/**
 * Imports the user's USDC transfers on Sui into `transactions`, under one "Sui wallet" account.
 * Read-only: it only reads history through Tatum; it never builds, signs or sends a transaction.
 *
 * Each sync reads at most WALLET_SYNC_MAX_PAGES pages. It starts from the newest transactions and
 * pages back until it meets transfers it already has; if it runs out of pages first, it saves the
 * cursor and the next sync continues from there. Digests are unique per user, so syncing twice,
 * or two syncs at once, never duplicates a transfer.
 */
@Injectable()
export class WalletSyncService {
  private readonly logger = new Logger(WalletSyncService.name);
  private readonly maxPages: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly database: DatabaseService,
    private readonly tatum: TatumService,
  ) {
    this.maxPages = env.WALLET_SYNC_MAX_PAGES;
  }

  async sync(session: Session) {
    if (session.method === "demo") {
      throw new AppError(HttpStatus.FORBIDDEN, "demo_not_supported", "Demo accounts don't have a real Sui wallet to sync.");
    }
    // Email accounts' addresses are ids nobody holds keys for: there is no wallet to read.
    if (session.method === "email") throw conflict("Connect a Sui wallet to sync it.", "no_wallet");
    if (!this.tatum.configured) throw notConfigured("Tatum (TATUM_API_KEY)");

    const db = this.database.db;
    const account = await this.suiAccount(session);
    const rules = new Map(
      (await db.select().from(categoryRules).where(eq(categoryRules.userAddress, session.address))).map((r) => [r.merchantKey, r]),
    );

    const counts: Counts = { imported: 0, alreadyImported: 0, failed: 0, undated: 0, dust: 0 };
    const queue: (string | null)[] = [null, ...account.syncPending];
    const pending: string[] = [];
    let budget = this.maxPages;
    let pagesRead = 0;

    for (const start of queue) {
      let cursor = start;
      for (;;) {
        if (budget === 0) {
          if (cursor) pending.push(cursor);
          break;
        }
        const page = await this.tatum.getUsdcTransferPage(session.address, { last: PAGE_SIZE, before: cursor });
        budget--;
        pagesRead++;
        const { eligible, inserted } = await this.store(session.address, account.id, page.transfers, rules, counts);
        // Stop once a page holds only transfers we already had: everything older is imported too.
        if ((eligible > 0 && inserted === 0) || !page.hasOlder) break;
        cursor = page.before;
      }
    }

    let balance: number | null = account.balance == null ? null : Number(account.balance);
    let balanceStatus: "updated" | "unavailable" = "updated";
    try {
      balance = Number((await this.tatum.getUsdcBalance(session.address)).usdc);
    } catch (err) {
      // The transfers are already saved; a failed balance read keeps the last known balance.
      balanceStatus = "unavailable";
      this.logger.warn(`Sui balance read failed after sync: ${err instanceof Error ? err.message : String(err)}`);
    }

    const syncedAt = new Date();
    await db
      .update(accounts)
      .set({ syncPending: pending, syncedAt, ...(balanceStatus === "updated" ? { balance: balance!.toFixed(2) } : {}) })
      .where(eq(accounts.id, account.id));

    return {
      account: { id: account.id, kind: "sui" as const, name: account.name, balance, currency: "USD", syncedAt: syncedAt.toISOString() },
      imported: counts.imported,
      alreadyImported: counts.alreadyImported,
      skipped: { failed: counts.failed, undated: counts.undated, dust: counts.dust },
      pagesRead,
      complete: pending.length === 0,
      balanceStatus,
    };
  }

  /** The user's Sui wallet account, created on first sync. The unique index makes concurrent creation safe. */
  private async suiAccount(session: Session) {
    const db = this.database.db;
    await db.insert(users).values({ address: session.address, method: session.method, name: session.name }).onConflictDoNothing();
    // USDC is treated as US dollars, so the account is in USD whatever the user's own currency is.
    await db.insert(accounts).values({ userAddress: session.address, kind: "sui", name: "Sui wallet", currency: "USD" }).onConflictDoNothing();
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userAddress, session.address), eq(accounts.kind, "sui")));
    return account;
  }

  /** Saves one page of transfers. Returns how many could be imported and how many were new. */
  private async store(
    address: string,
    accountId: string,
    transfers: UsdcTransfer[],
    rules: Map<string, { category: string; memoryId: string | null }>,
    counts: Counts,
  ) {
    const rows: (typeof transactions.$inferInsert)[] = [];
    for (const t of transfers) {
      if (t.status !== "success") {
        counts.failed++;
        continue;
      }
      if (!t.date) {
        counts.undated++;
        continue;
      }
      const value = Number(t.amount);
      // Amounts are stored in cents; transfers under half a cent would be recorded as $0.00.
      if (Math.round(value * 100) === 0) {
        counts.dust++;
        continue;
      }
      const key = suiMerchantKey(t.counterparty);
      const rule = rules.get(key);
      const fallback: CategoryId = t.direction === "in" ? "income" : "transfer";
      rows.push({
        userAddress: address,
        accountId,
        date: t.date.slice(0, 10),
        merchant: t.counterparty
          ? `USDC ${t.direction === "in" ? "from" : "to"} ${shortAddress(t.counterparty)}`
          : `USDC ${t.direction === "in" ? "received" : "sent"}`,
        merchantKey: key,
        amount: (t.direction === "in" ? value : -value).toFixed(2),
        category: rule?.category ?? fallback,
        learnedFromMemoryId: rule?.memoryId ?? null,
        externalId: t.digest,
        raw: { source: "sui", digest: t.digest, direction: t.direction, amountUsdc: t.amount, counterparty: t.counterparty ?? "", timestamp: t.date },
      });
    }
    if (rows.length === 0) return { eligible: 0, inserted: 0 };
    const inserted = await this.database.db
      .insert(transactions)
      .values(rows)
      .onConflictDoNothing({ target: [transactions.userAddress, transactions.externalId] })
      .returning({ id: transactions.id });
    counts.imported += inserted.length;
    counts.alreadyImported += rows.length - inserted.length;
    return { eligible: rows.length, inserted: inserted.length };
  }
}

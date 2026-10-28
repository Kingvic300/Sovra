import { Body, Controller, Delete, Get, Injectable, Logger, Module, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";
import { and, asc, eq, getTableColumns, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { notFound } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, transactions } from "../database/schema.js";
import { TatumService } from "../wallet/tatum.service.js";
import { WalletModule } from "../wallet/wallet.module.js";

const DAY = 86_400_000;
const TREND_DAYS = 30;

const cents = (n: number) => Math.round(n * 100) / 100;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export type WalletStatus = "live" | "not_configured" | "unavailable" | "skipped_demo";

const AccountPatch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    /** Current balance in dollars; negative for an overdraft, null when unknown. */
    balance: z.number().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.balance !== undefined, "Send a name or a balance.");

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly tatum: TatumService,
  ) {}

  /** The user's accounts with how many transactions each holds. Balances are null when unknown, never guessed. */
  async list(address: string) {
    const rows = await this.database.db
      .select({
        ...getTableColumns(accounts),
        transactionCount: sql<number>`count(${transactions.id})::int`,
        lastTransactionDate: sql<string | null>`max(${transactions.date})`,
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(eq(accounts.userAddress, address))
      .groupBy(accounts.id)
      .orderBy(asc(accounts.name), asc(accounts.id));
    return rows.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      balance: a.balance == null ? null : Number(a.balance),
      syncedAt: a.syncedAt?.toISOString() ?? null,
      transactionCount: Number(a.transactionCount),
      lastTransactionDate: a.lastTransactionDate ?? null,
    }));
  }

  /** USDC at the user's Sui address, read live. Demo addresses are never sent to Tatum. */
  async wallet(session: Session): Promise<{ address: string; usdc: number | null; status: WalletStatus; syncedAt: string | null }> {
    const unread = { address: session.address, usdc: null, syncedAt: null };
    if (session.method === "demo") return { ...unread, status: "skipped_demo" };
    if (!this.tatum.configured) return { ...unread, status: "not_configured" };
    try {
      const { usdc } = await this.tatum.getUsdcBalance(session.address);
      return { address: session.address, usdc: Number(usdc), status: "live", syncedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.warn(`Wallet balance unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return { ...unread, status: "unavailable" };
    }
  }

  /**
   * Total balance and a 30-day trend. The total adds accounts with a known balance and the live
   * Sui balance; anything that couldn't be counted is listed in `missing` instead of being guessed.
   * The trend covers accounts with a known balance and works backwards from it: the balance at
   * the end of a day is today's balance minus every transaction dated after that day.
   */
  async summary(session: Session, now = new Date()) {
    const [list, wallet] = await Promise.all([this.list(session.address), this.wallet(session)]);
    const known = list.filter((a): a is typeof a & { balance: number } => a.balance !== null);
    const missing = [
      ...list.filter((a) => a.balance === null).map((a) => ({ id: a.id, name: a.name, reason: "balance_unknown" as const })),
      ...(wallet.status === "live" ? [] : [{ id: null, name: "Sui wallet", reason: wallet.status }]),
    ];

    const banks = known.reduce((sum, a) => sum + a.balance, 0);
    const total = known.length || wallet.usdc !== null ? cents(banks + (wallet.usdc ?? 0)) : null;

    const days = Array.from({ length: TREND_DAYS }, (_, i) => isoDay(now.getTime() - (TREND_DAYS - 1 - i) * DAY));
    let trend: { date: string; balance: number }[] = [];
    if (known.length) {
      const moves = await this.database.db
        .select({ date: transactions.date, amount: sql<string>`sum(${transactions.amount})` })
        .from(transactions)
        .where(
          and(
            eq(transactions.userAddress, session.address),
            inArray(
              transactions.accountId,
              known.map((a) => a.id),
            ),
            gt(transactions.date, days[0]),
          ),
        )
        .groupBy(transactions.date);
      trend = days.map((day) => ({
        date: day,
        balance: cents(banks - moves.filter((m) => m.date > day).reduce((sum, m) => sum + Number(m.amount), 0)),
      }));
    }

    return {
      currency: "USD",
      total,
      banks: known.length ? cents(banks) : null,
      wallet,
      missing,
      trend,
      change30d: trend.length ? cents(trend[trend.length - 1].balance - trend[0].balance) : null,
    };
  }

  async update(address: string, id: string, patch: z.infer<typeof AccountPatch>) {
    const set: Partial<typeof accounts.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.balance !== undefined) set.balance = patch.balance === null ? null : patch.balance.toFixed(2);
    const updated = await this.database.db
      .update(accounts)
      .set(set)
      .where(and(eq(accounts.id, id), eq(accounts.userAddress, address)))
      .returning({ id: accounts.id });
    if (updated.length === 0) throw notFound("Account");
    return (await this.list(address)).find((a) => a.id === id)!;
  }

  /** Deletes the account and the transactions imported with it, together. */
  async remove(address: string, id: string) {
    return this.database.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, id), eq(accounts.userAddress, address)));
      if (!account) throw notFound("Account");
      const removed = await tx
        .delete(transactions)
        .where(and(eq(transactions.accountId, id), eq(transactions.userAddress, address)))
        .returning({ id: transactions.id });
      await tx.delete(accounts).where(eq(accounts.id, id));
      return { id, deleted: true, transactionsDeleted: removed.length };
    });
  }
}

@Controller("accounts")
@UseGuards(SessionGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async list(@CurrentSession() s: Session) {
    const [list, wallet] = await Promise.all([this.accounts.list(s.address), this.accounts.wallet(s)]);
    return { accounts: list, wallet };
  }

  @Get("summary")
  summary(@CurrentSession() s: Session) {
    return this.accounts.summary(s);
  }

  @Patch(":id")
  update(
    @CurrentSession() s: Session,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(AccountPatch)) body: z.infer<typeof AccountPatch>,
  ) {
    return this.accounts.update(s.address, id, body);
  }

  @Delete(":id")
  remove(@CurrentSession() s: Session, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.accounts.remove(s.address, id);
  }
}

@Module({
  imports: [WalletModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}

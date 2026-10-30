import { Controller, Get, HttpCode, Injectable, Logger, Module, Param, Post, UseGuards } from "@nestjs/common";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { notFound } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DatabaseService } from "../database/database.service.js";
import { accounts, recurringStates, transactions, users } from "../database/schema.js";
import { CurrencyService } from "../fx/currency.service.js";
import { FxService } from "../fx/fx.service.js";
import { MemoryModule } from "../memory/memory.module.js";
import { MemwalService } from "../memory/memwal.service.js";
import { CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import { recurringDecisionSentence } from "../shared/memory-text.js";

const DAY = 86_400_000;
const LOOKBACK_DAYS = 120;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const toDay = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export type RecurringCharge = {
  merchant: string;
  merchantKey: string;
  category: string;
  amount: number;
  cadence: "weekly" | "monthly";
  occurrences: number;
  lastDate: string;
  nextDate: string;
};

/**
 * Finds charges that repeat: same merchant, amounts within 15% of the median,
 * and gaps of about a week or a month between them.
 */
export function detectRecurring(rows: { date: string; merchant: string; merchantKey: string; category: string; amount: number }[]) {
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.amount >= 0) continue;
    const list = groups.get(r.merchantKey) ?? [];
    list.push(r);
    groups.set(r.merchantKey, list);
  }

  const found: RecurringCharge[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((r) => -r.amount);
    const typical = median(amounts);
    if (amounts.some((a) => Math.abs(a - typical) / typical > 0.15)) continue;

    const gaps = sorted.slice(1).map((r, i) => (toDay(r.date) - toDay(sorted[i].date)) / DAY);
    const gap = median(gaps);
    const cadence = gap >= 25 && gap <= 35 ? "monthly" : gap >= 6 && gap <= 8 ? "weekly" : null;
    if (!cadence || gaps.some((g) => Math.abs(g - gap) > (cadence === "monthly" ? 6 : 2))) continue;

    const last = sorted[sorted.length - 1];
    found.push({
      merchant: last.merchant,
      merchantKey: key,
      category: last.category,
      amount: Math.round(typical * 100) / 100,
      cadence,
      occurrences: sorted.length,
      lastDate: last.date,
      nextDate: fromDay(toDay(last.date) + Math.round(gap) * DAY),
    });
  }
  return found.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/** Stable, URL-safe id for a recurring charge: its merchant key, base64url-encoded. */
export const recurringId = (merchantKey: string) => Buffer.from(merchantKey, "utf8").toString("base64url");
const merchantKeyOf = (id: string) => Buffer.from(id, "base64url").toString("utf8");

export type RecurringStatus = "active" | "paused";
export type RecurringItem = RecurringCharge & { currency: string; id: string; status: RecurringStatus; pausedAt: string | null };

/** Shown with every pause or resume: Sovra only changes what it counts, never the subscription itself. */
export const pauseNote = (merchant: string) =>
  `Pausing only stops Sovra counting this charge in your budgets and reminders. To stop paying, cancel or pause it with ${merchant}.`;

const addMonths = (iso: string, months: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return fromDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)));
};

/**
 * Dates a charge is still expected on within [from, to): its next date, then every week, or the
 * same day of each following month (clamped to the month's last day).
 */
export function expectedDates(charge: Pick<RecurringCharge, "nextDate" | "cadence">, from: string, to: string) {
  const dates: string[] = [];
  for (let i = 0, date = charge.nextDate; date < to && i < 400; i++) {
    if (date >= from) dates.push(date);
    date = charge.cadence === "weekly" ? fromDay(toDay(charge.nextDate) + (i + 1) * 7 * DAY) : addMonths(charge.nextDate, i + 1);
  }
  return dates;
}

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly fx: FxService,
    private readonly currencies: CurrencyService,
    private readonly memory: MemwalService,
  ) {}

  /** Detected recurring charges with the user's pause state. Paused ones stay listed so they can be resumed. */
  async list(address: string, now = new Date()): Promise<RecurringItem[]> {
    // Resolve the database first: without one it throws 503 here, before any query has started.
    const db = this.database.db;
    const [detected, states] = await Promise.all([
      this.detect(address, now),
      db.select().from(recurringStates).where(eq(recurringStates.userAddress, address)),
    ]);
    const byKey = new Map(states.map((s) => [s.merchantKey, s]));
    return detected.map((r) => {
      const state = byKey.get(r.merchantKey);
      return {
        ...r,
        id: recurringId(r.merchantKey),
        status: state?.status ?? "active",
        pausedAt: state?.status === "paused" ? (state.pausedAt?.toISOString() ?? null) : null,
      };
    });
  }

  /** Charges Sovra counts in projections, upcoming bills and reminders. */
  async active(address: string, now = new Date()) {
    return (await this.list(address, now)).filter((r) => r.status === "active");
  }

  /**
   * Pauses or resumes Sovra's tracking of a charge. Doing it twice changes nothing. The decision is
   * remembered best-effort: a Walrus failure never fails the change.
   */
  async setStatus(session: Session, id: string, status: RecurringStatus, now = new Date()) {
    const item = (await this.list(session.address, now)).find((r) => r.merchantKey === merchantKeyOf(id));
    if (!item) throw notFound("Recurring charge");
    const note = pauseNote(item.merchant);
    if (item.status === status) return { recurring: item, changed: false, memory: null, note };

    const db = this.database.db;
    await db.insert(users).values({ address: session.address, method: session.method, name: session.name }).onConflictDoNothing();
    const values = { status, pausedAt: status === "paused" ? now : null, updatedAt: now };
    await db
      .insert(recurringStates)
      .values({ userAddress: session.address, merchantKey: item.merchantKey, ...values })
      .onConflictDoUpdate({ target: [recurringStates.userAddress, recurringStates.merchantKey], set: values });

    const label = CATEGORY_LABELS[item.category as CategoryId] ?? item.category;
    const text = recurringDecisionSentence(item.merchant, status, now, label);
    return {
      recurring: { ...item, status, pausedAt: values.pausedAt?.toISOString() ?? null },
      changed: true,
      memory: await this.rememberSafely(session.address, text),
      note,
    };
  }

  private async rememberSafely(address: string, text: string) {
    if (!(await this.memory.availableFor(address))) return { status: "skipped" as const, text, reason: "not_configured" };
    try {
      await this.memory.remember(address, { kind: "decision", text, source: "You chose on the Recurring page" });
      return { status: "saved" as const, text };
    } catch (err) {
      this.logger.warn(`Recurring decision memory failed: ${err instanceof Error ? err.message : String(err)}`);
      return { status: "failed" as const, text };
    }
  }

  /** Repeating charges with amounts in the user's currency, so they line up with budgets. */
  private async detect(address: string, now: Date) {
    const today = now.getTime();
    const currency = await this.currencies.forUser(address);
    const { convert } = await this.fx.converterTo(currency);
    const rows = await this.database.db
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
          gte(transactions.date, fromDay(today - LOOKBACK_DAYS * DAY)),
          lt(transactions.amount, "0"),
        ),
      )
      .orderBy(asc(transactions.date));
    // Charges in a currency with no rate today can't be compared, so they're left out rather than guessed.
    const converted = rows.flatMap((r) => {
      const amount = convert(Number(r.amount), r.currency);
      return amount === null ? [] : [{ ...r, amount }];
    });
    return detectRecurring(converted).map((r) => ({ ...r, currency }));
  }
}

const IdParam = z.string().regex(/^[A-Za-z0-9_-]{1,400}$/, "Unknown recurring charge id");

@Controller("recurring")
@UseGuards(SessionGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  async list(@CurrentSession() s: Session) {
    return { recurring: await this.recurring.list(s.address) };
  }

  @Post(":id/pause")
  @HttpCode(200)
  pause(@CurrentSession() s: Session, @Param("id", new ZodPipe(IdParam)) id: string) {
    return this.recurring.setStatus(s, id, "paused");
  }

  @Post(":id/resume")
  @HttpCode(200)
  resume(@CurrentSession() s: Session, @Param("id", new ZodPipe(IdParam)) id: string) {
    return this.recurring.setStatus(s, id, "active");
  }
}

@Module({ imports: [MemoryModule], controllers: [RecurringController], providers: [RecurringService], exports: [RecurringService] })
export class RecurringModule {}

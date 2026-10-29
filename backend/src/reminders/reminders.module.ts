import { createHash, timingSafeEqual } from "node:crypto";
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { and, asc, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { DemoService } from "../auth/demo.service.js";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { BudgetsModule } from "../budgets/budgets.module.js";
import { BudgetsService } from "../budgets/budgets.service.js";
import { AppError, notFound, unauthorized } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { reminders, users } from "../database/schema.js";
import { RecurringModule, RecurringService } from "../recurring/recurring.module.js";
import { CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import { formatMoney } from "../shared/currency.js";

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoDay = (t: Date) => t.toISOString().slice(0, 10);
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
/** "₦26,985.00" or "$17.99": an exact amount in the user's currency. */
const exact = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]);

type Desired = Pick<typeof reminders.$inferInsert, "kind" | "ref" | "dueDate" | "title" | "body" | "tone" | "link">;
const keyOf = (r: { kind: string; ref: string; dueDate: string }) => `${r.kind}|${r.ref}|${r.dueDate}`;

/**
 * Builds reminders from the database only (recurring detection and budget projections): no AI,
 * Walrus or Tatum calls, so running it often costs nothing.
 */
@Injectable()
export class RemindersService {
  private readonly daysAhead: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly database: DatabaseService,
    private readonly recurring: RecurringService,
    private readonly budgets: BudgetsService,
  ) {
    this.daysAhead = env.REMINDER_DAYS_AHEAD;
  }

  /**
   * Brings one user's reminders up to date. Idempotent: the same state gives the same rows.
   * - renewal: an active (not paused) recurring charge due within REMINDER_DAYS_AHEAD days.
   * - budget_over: a budget whose projected spending this month (spent + renewals still due) is over its limit.
   * Open reminders whose reason has gone are marked resolved; dismissed ones stay dismissed.
   */
  async refreshFor(address: string, now = new Date()) {
    const db = this.database.db;
    const today = isoDay(now);
    const horizon = isoDay(new Date(now.getTime() + this.daysAhead * DAY));
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;

    const desired: Desired[] = [];
    for (const r of await this.recurring.active(address, now)) {
      if (r.nextDate < today || r.nextDate > horizon) continue;
      const label = CATEGORY_LABELS[r.category as CategoryId] ?? r.category;
      desired.push({
        kind: "renewal",
        ref: r.id,
        dueDate: r.nextDate,
        title: `${r.merchant} renews on ${shortDay(r.nextDate)}`,
        body: `${exact(r.amount, r.currency)} from your ${label.toLowerCase()} budget.`,
        tone: "caution",
        link: "/app/recurring",
      });
    }
    const monthBudgets = await this.budgets.list(address, month, now);
    const money = (n: number) => formatMoney(n, monthBudgets.currency);
    for (const b of monthBudgets.budgets) {
      if (b.projected <= b.limit) continue;
      const names = [...new Set(b.renewals.map((r) => r.merchant))];
      desired.push({
        kind: "budget_over",
        ref: b.category,
        dueDate: monthStart,
        title: `${b.label} will go over`,
        body: names.length
          ? `${list(names)} ${names.length > 1 ? "renew" : "renews"} before the month ends, taking it to ${money(b.projected)} of ${money(b.limit)}.`
          : `Spending is at ${money(b.projected)} of ${money(b.limit)}.`,
        tone: "over",
        link: "/app/budgets",
      });
    }

    const current = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userAddress, address),
          or(and(eq(reminders.kind, "renewal"), gte(reminders.dueDate, today)), and(eq(reminders.kind, "budget_over"), eq(reminders.dueDate, monthStart))),
        ),
      );
    const existing = new Map(current.map((r) => [keyOf(r), r]));
    const counts = { created: 0, updated: 0, resolved: 0 };

    for (const d of desired) {
      const before = existing.get(keyOf(d as { kind: string; ref: string; dueDate: string }));
      if (before && before.title === d.title && before.body === d.body && before.resolvedAt === null) continue;
      before ? counts.updated++ : counts.created++;
      await db
        .insert(reminders)
        .values({ userAddress: address, ...d })
        .onConflictDoUpdate({
          target: [reminders.userAddress, reminders.kind, reminders.ref, reminders.dueDate],
          // Text follows the latest numbers; a reason that came back reopens it. Dismissals are kept.
          set: { title: d.title, body: d.body, tone: d.tone, link: d.link, updatedAt: now, resolvedAt: null },
        });
    }

    const wanted = new Set(desired.map((d) => keyOf(d as { kind: string; ref: string; dueDate: string })));
    const gone = current.filter((r) => r.resolvedAt === null && !wanted.has(keyOf(r)));
    for (const r of gone) await db.update(reminders).set({ resolvedAt: now, updatedAt: now }).where(eq(reminders.id, r.id));
    counts.resolved = gone.length;
    return counts;
  }

  /** Open reminders, refreshed first so they're current even when no scheduled job runs. */
  async list(address: string, now = new Date()) {
    await this.refreshFor(address, now);
    const today = isoDay(now);
    const rows = await this.database.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userAddress, address),
          isNull(reminders.dismissedAt),
          isNull(reminders.resolvedAt),
          or(
            and(eq(reminders.kind, "renewal"), gte(reminders.dueDate, today)),
            and(eq(reminders.kind, "budget_over"), gte(reminders.dueDate, `${today.slice(0, 7)}-01`)),
          ),
        ),
      )
      .orderBy(desc(sql`${reminders.tone} = 'over'`), asc(reminders.dueDate), asc(reminders.createdAt));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      tone: r.tone,
      to: r.link,
      dueDate: r.dueDate,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Hides a reminder for good. Dismissing twice is fine; another user's reminder is a 404. */
  async dismiss(address: string, id: string, now = new Date()) {
    const db = this.database.db;
    const [row] = await db
      .select({ id: reminders.id, dismissedAt: reminders.dismissedAt })
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userAddress, address)));
    if (!row) throw notFound("Reminder");
    if (!row.dismissedAt) await db.update(reminders).set({ dismissedAt: now, updatedAt: now }).where(eq(reminders.id, id));
    return { id, dismissed: true };
  }
}

/**
 * The scheduled work: delete expired demo accounts, then refresh every remaining user's reminders.
 * Idempotent and database-only, so it is safe to run as often as a cron likes, or twice at once.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly demo: DemoService,
    private readonly remindersService: RemindersService,
  ) {}

  async runAll(now = new Date()) {
    const started = Date.now();
    const demoAccountsDeleted = await this.demo.cleanupExpired(now);
    const live = await this.database.db
      .select({ address: users.address })
      .from(users)
      .where(or(isNull(users.expiresAt), gt(users.expiresAt, now)))
      .orderBy(asc(users.address));

    const totals = { users: live.length, created: 0, updated: 0, resolved: 0, failed: 0 };
    for (const { address } of live) {
      try {
        const c = await this.remindersService.refreshFor(address, now);
        totals.created += c.created;
        totals.updated += c.updated;
        totals.resolved += c.resolved;
      } catch (err) {
        // One user's bad data must not stop everyone else's reminders.
        totals.failed++;
        this.logger.warn(`Reminders failed for one user: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const result = { demoAccountsDeleted, reminders: totals, durationMs: Date.now() - started };
    this.logger.log(`Jobs done: ${JSON.stringify(result)}`);
    return result;
  }
}

/**
 * Optional in-process schedule (JOBS_INTERVAL_MINUTES > 0). Only for hosts that keep one process
 * running; on serverless or scale-to-zero hosts use the cron endpoint or `npm run jobs:run` instead.
 */
@Injectable()
export class JobScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly database: DatabaseService,
    private readonly jobs: JobsService,
  ) {}

  get enabled() {
    return this.timer !== undefined;
  }

  onApplicationBootstrap() {
    const minutes = this.env.JOBS_INTERVAL_MINUTES;
    if (!minutes || !this.database.available) return;
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    // Never keeps a process alive on its own (CLI scripts, tests, shutdown).
    this.timer.unref();
    this.logger.log(`Running jobs every ${minutes} minute(s) in this process.`);
  }

  /** One run at a time: a slow run makes the next tick skip instead of piling up. */
  async tick() {
    if (this.running) return false;
    this.running = true;
    try {
      await this.jobs.runAll();
      return true;
    } catch (err) {
      this.logger.warn(`Scheduled jobs failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

const digest = (value: string) => createHash("sha256").update(value).digest();

@Controller("reminders")
@UseGuards(SessionGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  async list(@CurrentSession() s: Session) {
    return { reminders: await this.remindersService.list(s.address) };
  }

  @Post(":id/dismiss")
  @HttpCode(200)
  dismiss(@CurrentSession() s: Session, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.remindersService.dismiss(s.address, id);
  }
}

/**
 * For a platform cron (Render, Railway, Vercel Cron, GitHub Actions...): POST with
 * `Authorization: Bearer <CRON_SECRET>`. Answers 404 when CRON_SECRET isn't set.
 */
@Controller("internal/jobs")
export class JobsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jobs: JobsService,
  ) {}

  @Post("run")
  @HttpCode(200)
  run(@Headers("authorization") authorization: string | undefined) {
    const secret = this.env.CRON_SECRET;
    if (!secret) throw new AppError(HttpStatus.NOT_FOUND, "not_found", "Not found.");
    const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    // Compare fixed-length digests in constant time; the secret itself is never logged or echoed.
    if (!timingSafeEqual(digest(presented), digest(secret))) throw unauthorized("Invalid job credentials.");
    return this.jobs.runAll();
  }
}

@Module({
  imports: [RecurringModule, BudgetsModule],
  controllers: [RemindersController, JobsController],
  providers: [RemindersService, JobsService, JobScheduler],
  exports: [RemindersService, JobsService],
})
export class RemindersModule {}

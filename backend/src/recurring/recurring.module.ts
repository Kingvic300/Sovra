import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { transactions } from "../database/schema.js";

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

@Injectable()
export class RecurringService {
  constructor(private readonly database: DatabaseService) {}

  async list(address: string) {
    const today = Date.now();
    const rows = await this.database.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userAddress, address),
          gte(transactions.date, fromDay(today - LOOKBACK_DAYS * DAY)),
          lt(transactions.amount, "0"),
        ),
      )
      .orderBy(asc(transactions.date));
    return detectRecurring(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  }
}

@Controller("recurring")
@UseGuards(SessionGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  async list(@CurrentSession() s: Session) {
    return { recurring: await this.recurring.list(s.address) };
  }
}

@Module({ controllers: [RecurringController], providers: [RecurringService], exports: [RecurringService] })
export class RecurringModule {}

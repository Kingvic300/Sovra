/**
 * Rule-based checks that run before the model sees anything. They catch the patterns a model is
 * least reliable at (exact duplicates, statistics across hundreds of rows) and give it concrete
 * leads to explain. Pure functions: no I/O, nothing kept.
 */

export type AuditRow = {
  /** Stable id the model refers to, e.g. "r12". */
  id: string;
  date: string;
  merchant: string;
  merchantKey: string;
  /** Signed: negative is money out. */
  amount: number;
  /** Which uploaded file the row came from. */
  source: string;
};

export type SignalKind = "duplicate" | "outlier" | "price_rise" | "fee" | "large_new_merchant" | "round_transfer" | "weekend_cash";

export type Signal = {
  kind: SignalKind;
  rowIds: string[];
  severity: "low" | "medium" | "high";
  /** Plain-language explanation using only numbers from the rows. */
  detail: string;
};

const DUPLICATE_WINDOW_DAYS = 3;
const FEE_PATTERN = /\b(fee|fees|charge|charges|overdraft|penalty|late payment|interest charged|commission|stamp duty|sms alert|maintenance)\b/i;
const CASH_PATTERN = /\b(atm|cash withdrawal|pos withdrawal|cash)\b/i;

const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const fmt = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Same merchant, same amount, within a few days: often a double charge. */
function duplicates(debits: AuditRow[]): Signal[] {
  const out: Signal[] = [];
  const seen = new Set<string>();
  const sorted = [...debits].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (seen.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < sorted.length && days(a.date, sorted[j].date) <= DUPLICATE_WINDOW_DAYS; j++) {
      const b = sorted[j];
      if (b.merchantKey === a.merchantKey && b.amount === a.amount && b.source === a.source) group.push(b);
    }
    if (group.length < 2) continue;
    group.forEach((r) => seen.add(r.id));
    out.push({
      kind: "duplicate",
      rowIds: group.map((r) => r.id),
      severity: Math.abs(a.amount) * (group.length - 1) >= 50 ? "high" : "medium",
      detail: `${a.merchant} charged ${fmt(a.amount)} ${group.length} times within ${DUPLICATE_WINDOW_DAYS} days (${group.map((r) => r.date).join(", ")}).`,
    });
  }
  return out;
}

/** A charge far above what this merchant usually costs, or far above the statement's typical spend. */
function outliers(debits: AuditRow[]): Signal[] {
  const out: Signal[] = [];
  const byMerchant = new Map<string, AuditRow[]>();
  for (const r of debits) byMerchant.set(r.merchantKey, [...(byMerchant.get(r.merchantKey) ?? []), r]);

  const flagged = new Set<string>();
  for (const rows of byMerchant.values()) {
    if (rows.length < 3) continue;
    const typical = median(rows.map((r) => Math.abs(r.amount)));
    for (const r of rows) {
      if (Math.abs(r.amount) >= typical * 2.5 && Math.abs(r.amount) - typical >= 20) {
        flagged.add(r.id);
        out.push({
          kind: "outlier",
          rowIds: [r.id],
          severity: Math.abs(r.amount) >= typical * 4 ? "high" : "medium",
          detail: `${r.merchant} on ${r.date} was ${fmt(r.amount)}, about ${(Math.abs(r.amount) / typical).toFixed(1)}x the usual ${fmt(typical)}.`,
        });
      }
    }
  }

  // Across the whole statement: robust z-score on spend size (median absolute deviation).
  const sizes = debits.map((r) => Math.abs(r.amount));
  if (sizes.length >= 8) {
    const m = median(sizes);
    const mad = median(sizes.map((s) => Math.abs(s - m))) || 1;
    for (const r of debits) {
      if (flagged.has(r.id)) continue;
      const z = (0.6745 * (Math.abs(r.amount) - m)) / mad;
      if (z > 6 && Math.abs(r.amount) > m * 5) {
        out.push({
          kind: "outlier",
          rowIds: [r.id],
          severity: z > 12 ? "high" : "medium",
          detail: `${r.merchant} on ${r.date} (${fmt(r.amount)}) is far larger than a typical payment on this statement (${fmt(m)}).`,
        });
      }
    }
  }
  return out;
}

/** A repeating charge that went up: subscription price rises hide in plain sight. */
function priceRises(debits: AuditRow[]): Signal[] {
  const out: Signal[] = [];
  const byMerchant = new Map<string, AuditRow[]>();
  for (const r of debits) byMerchant.set(r.merchantKey, [...(byMerchant.get(r.merchantKey) ?? []), r]);
  for (const rows of byMerchant.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const earlier = sorted.slice(0, -1).map((r) => Math.abs(r.amount));
    const last = sorted[sorted.length - 1];
    // Only for steady charges: the earlier ones must agree with each other.
    const steady = Math.max(...earlier) - Math.min(...earlier) <= Math.max(1, median(earlier) * 0.02);
    const before = median(earlier);
    if (steady && Math.abs(last.amount) > before * 1.05 && Math.abs(last.amount) - before >= 1) {
      out.push({
        kind: "price_rise",
        rowIds: [last.id],
        severity: Math.abs(last.amount) > before * 1.25 ? "medium" : "low",
        detail: `${last.merchant} went from ${fmt(before)} to ${fmt(last.amount)} on ${last.date}.`,
      });
    }
  }
  return out;
}

function fees(debits: AuditRow[]): Signal[] {
  const rows = debits.filter((r) => FEE_PATTERN.test(r.merchant));
  if (!rows.length) return [];
  const total = rows.reduce((s, r) => s + Math.abs(r.amount), 0);
  return [
    {
      kind: "fee",
      rowIds: rows.map((r) => r.id),
      severity: total >= 50 ? "medium" : "low",
      detail: `${rows.length} bank or service fee${rows.length === 1 ? "" : "s"} totalling ${fmt(total)}.`,
    },
  ];
}

/** A first-time merchant with one of the statement's biggest payments. */
function largeNewMerchants(debits: AuditRow[]): Signal[] {
  if (debits.length < 8) return [];
  const counts = new Map<string, number>();
  for (const r of debits) counts.set(r.merchantKey, (counts.get(r.merchantKey) ?? 0) + 1);
  const sizes = debits.map((r) => Math.abs(r.amount)).sort((a, b) => b - a);
  const cutoff = sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.05))];
  return debits
    .filter((r) => counts.get(r.merchantKey) === 1 && Math.abs(r.amount) >= cutoff && !FEE_PATTERN.test(r.merchant))
    .slice(0, 5)
    .map((r) => ({
      kind: "large_new_merchant" as const,
      rowIds: [r.id],
      severity: "low" as const,
      detail: `${r.merchant} appears once, on ${r.date}, for ${fmt(r.amount)}: one of the largest payments here.`,
    }));
}

/** Large round-number payments out: common in scams and unplanned transfers. */
function roundTransfers(debits: AuditRow[]): Signal[] {
  const sizes = debits.map((r) => Math.abs(r.amount));
  if (sizes.length < 5) return [];
  const m = median(sizes);
  return debits
    .filter((r) => Math.abs(r.amount) >= Math.max(m * 8, 100) && Math.abs(r.amount) % 100 === 0)
    .slice(0, 5)
    .map((r) => ({
      kind: "round_transfer" as const,
      rowIds: [r.id],
      severity: "low" as const,
      detail: `${r.merchant} on ${r.date}: a round ${fmt(r.amount)}, much larger than usual.`,
    }));
}

function weekendCash(debits: AuditRow[]): Signal[] {
  const rows = debits.filter((r) => CASH_PATTERN.test(r.merchant) && [0, 6].includes(new Date(`${r.date}T00:00:00Z`).getUTCDay()));
  if (rows.length < 3) return [];
  const total = rows.reduce((s, r) => s + Math.abs(r.amount), 0);
  return [
    {
      kind: "weekend_cash",
      rowIds: rows.map((r) => r.id),
      severity: "low",
      detail: `${rows.length} cash withdrawals on weekends, ${fmt(total)} in all. Cash is hard to track afterwards.`,
    },
  ];
}

/** Every rule-based signal for a set of rows, most severe first. */
export function detectSignals(rows: AuditRow[]): Signal[] {
  const debits = rows.filter((r) => r.amount < 0);
  const order = { high: 0, medium: 1, low: 2 };
  return [
    ...duplicates(debits),
    ...outliers(debits),
    ...priceRises(debits),
    ...fees(debits),
    ...largeNewMerchants(debits),
    ...roundTransfers(debits),
    ...weekendCash(debits),
  ].sort((a, b) => order[a.severity] - order[b.severity]);
}

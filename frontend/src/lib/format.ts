/**
 * The currency amounts are shown in when none is given: the one the user picked in setup.
 * AppDataProvider sets it before the app renders, so every screen formats the same way.
 */
let displayCurrency = "USD";

export function setDisplayCurrency(code: string) {
  displayCurrency = code || "USD";
}

export function getDisplayCurrency() {
  return displayCurrency;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, whole: boolean) {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      // narrowSymbol prints ₦ and £ rather than "NGN" or "GBP".
      f = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        ...(whole ? { maximumFractionDigits: 0 } : {}),
      });
    } catch {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...(whole ? { maximumFractionDigits: 0 } : {}) });
    }
    formatters.set(key, f);
  }
  return f;
}

/** ₦1,234.50 in the user's currency, or in `currency` for an account's own amounts. Use `whole` for budget-style figures. */
export function money(amount: number, opts: { whole?: boolean; currency?: string } = {}) {
  return formatter(opts.currency ?? displayCurrency, Boolean(opts.whole)).format(amount);
}

/** Signed amount with a true minus sign: −₦38.20 / +₦650.00 */
export function signedMoney(amount: number, currency?: string) {
  const text = money(Math.abs(amount), { currency });
  return amount < 0 ? `−${text}` : `+${text}`;
}

/** Splits ₦4,218.40 into ["₦4,218", ".40"] so cents can be styled smaller. */
export function splitMoney(amount: number, currency?: string): [string, string] {
  const text = money(amount, { currency });
  const dot = text.lastIndexOf(".");
  return dot === -1 ? [text, ""] : [text.slice(0, dot), text.slice(dot)];
}

/** "₦" for NGN, "$" for USD. */
export function currencySymbol(currency = displayCurrency) {
  return formatter(currency, true).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}

/**
 * A round amount worth about `usd` dollars in the user's currency, for example chips and prompts:
 * $100 is ₦150,000 at ₦1,500 per $1. `perUsd` is the day's rate; 1 when unknown.
 */
export function niceAmount(usd: number, perUsd = 1) {
  const raw = usd * perUsd;
  if (raw < 10) return Math.max(1, Math.round(raw));
  const step = 10 ** Math.floor(Math.log10(raw)) / 2;
  return Math.round(raw / step) * step;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** "27 Oct" */
export function shortDate(iso: string) {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Tuesday, 27 October" */
export function longDate(iso: string) {
  const { y, m, d } = parts(iso);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${d} ${MONTHS_LONG[m - 1]}`;
}

/** "October" */
export function monthName(iso: string) {
  return MONTHS_LONG[parts(iso).m - 1];
}

/** Whole days from `from` to `to`, both ISO dates. */
export function daysBetween(from: string, to: string) {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** "today", "tomorrow", "in 3 days" */
export function relativeDays(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

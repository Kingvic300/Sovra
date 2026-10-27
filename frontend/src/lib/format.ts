const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** $1,234.50. Use `whole` for budget-style figures. */
export function money(amount: number, opts: { whole?: boolean } = {}) {
  return (opts.whole ? usdWhole : usd).format(amount);
}

/** Signed amount with a true minus sign: −$38.20 / +$650.00 */
export function signedMoney(amount: number) {
  const text = usd.format(Math.abs(amount));
  return amount < 0 ? `−${text}` : `+${text}`;
}

/** Splits $4,218.40 into ["$4,218", ".40"] so cents can be styled smaller. */
export function splitMoney(amount: number): [string, string] {
  const text = usd.format(amount);
  const dot = text.lastIndexOf(".");
  return dot === -1 ? [text, ""] : [text.slice(0, dot), text.slice(dot)];
}

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

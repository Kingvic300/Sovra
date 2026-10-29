/** ISO 4217 codes are three capital letters. */
export const CURRENCY_CODE = /^[A-Z]{3}$/;

export const DEFAULT_CURRENCY = "USD";

/** Symbols and words banks print in headers or amounts, most specific first ("GH₵" before "₵", "US$" before "$"). */
const MARKERS: [RegExp, string][] = [
  [/₦|\bngn\b|\bnaira\b/i, "NGN"],
  [/gh₵|\bghs\b|\bcedis?\b|₵/i, "GHS"],
  [/\bksh\b|\bkes\b/i, "KES"],
  [/\bzar\b|\brand\b/i, "ZAR"],
  [/£|\bgbp\b/i, "GBP"],
  [/€|\beur\b/i, "EUR"],
  [/₹|\binr\b/i, "INR"],
  [/¥|\bjpy\b/i, "JPY"],
  [/\bcad\b|ca\$/i, "CAD"],
  [/\baud\b|a\$/i, "AUD"],
  [/\busd\b|us\$|\$/i, "USD"],
];

/**
 * The currency a statement is in, from its column names (e.g. "Debit(₦)") or its first amounts
 * (e.g. "₦1,250.00"). Null when nothing says, so the caller falls back to the user's currency.
 */
export function detectCurrency(headers: string[], sampleValues: string[] = []) {
  for (const text of [headers.join(" "), sampleValues.join(" ")]) {
    for (const [pattern, code] of MARKERS) if (pattern.test(text)) return code;
  }
  return null;
}

/** "₦12,500" in the user's currency, for memory sentences. */
export function formatMoney(amount: number, currency = DEFAULT_CURRENCY) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}

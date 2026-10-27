/** Category ids shared with the frontend (frontend/src/lib/demo-data.ts), plus "uncategorized" for imports. */
export const CATEGORY_IDS = [
  "food",
  "transport",
  "entertainment",
  "business",
  "shopping",
  "bills",
  "health",
  "income",
  "transfer",
  "uncategorized",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  food: "Food and groceries",
  transport: "Transport",
  entertainment: "Entertainment",
  business: "Business supplies",
  shopping: "Shopping",
  bills: "Bills and rent",
  health: "Health",
  income: "Income",
  transfer: "Rent share",
  uncategorized: "Uncategorized",
};

const KEYWORDS: [RegExp, CategoryId][] = [
  [/\b(bolt|uber|lyft|taxi|fuel|petrol|metro|train|bus)\b/i, "transport"],
  [/\b(shoprite|grocer|supermarket|market|restaurant|cafe|chicken|pizza|kfc|food)\b/i, "food"],
  [/\b(netflix|spotify|disney|steam|cinema|filmhouse|youtube|apple music|playstation)\b/i, "entertainment"],
  [/\b(rent|electric|water bill|internet|spectranet|mtn|airtel|glo|icloud|insurance)\b/i, "bills"],
  [/\b(pharmacy|clinic|hospital|gym|fithub|medplus)\b/i, "health"],
  [/\b(amazon|jumia|konga|aliexpress|store|shop)\b/i, "shopping"],
];

/**
 * First-pass category before learned rules or AI run.
 * Positive amounts that look like pay are income; known merchants match by keyword.
 */
export function guessCategory(merchant: string, amount: number): CategoryId {
  if (amount > 0 && /\b(payout|salary|invoice|payment from|transfer from|refund|upwork|toptal)\b/i.test(merchant)) {
    return "income";
  }
  for (const [pattern, category] of KEYWORDS) if (pattern.test(merchant)) return category;
  return amount > 0 ? "income" : "uncategorized";
}

/** Normalises a merchant description so "AMAZON MKTPLACE 123" and "Amazon" share learned rules. */
export function merchantKey(merchant: string) {
  return merchant
    .toLowerCase()
    .replace(/[0-9#*]+/g, " ")
    .replace(/\b(pos|ref|txn|purchase|payment|card|ltd|inc|plc|mktplace|marketplace)\b/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

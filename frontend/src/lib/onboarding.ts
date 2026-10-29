import type { Profile } from "@/lib/auth-context";
import { CATEGORIES } from "@/lib/demo-data";
import { currencyName } from "@/lib/currency";
import { money } from "@/lib/format";

export type MemoryDraft = { text: string; highlight: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function ordinal(n: number) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** End-of-month ISO dates for the next `count` months, with labels like "January 2027". */
export function upcomingMonths(count: number, from = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i + 2, 0));
    return {
      value: d.toISOString().slice(0, 10),
      label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      month: MONTHS[d.getUTCMonth()],
    };
  });
}

export function currencyMemory(p: Partial<Profile>): MemoryDraft | null {
  if (!p.currency) return null;
  const highlight = currencyName(p.currency);
  return { text: `Your money is counted in ${highlight}.`, highlight };
}

export function nameMemory(p: Partial<Profile>): MemoryDraft | null {
  const name = p.name?.trim();
  return name ? { text: `You go by ${name}.`, highlight: name } : null;
}

export function sourcesMemory(p: Partial<Profile>): MemoryDraft | null {
  const parts = [p.sources?.csv && "a bank account", p.sources?.sui && "USDC on Sui"].filter(Boolean) as string[];
  if (!parts.length) return null;
  const highlight = parts.join(" and ");
  return { text: `Your money is in ${highlight}.`, highlight };
}

export function goalMemory(p: Partial<Profile>): MemoryDraft | null {
  if (!p.goal?.name.trim() || !(p.goal.target > 0)) return null;
  const month = MONTHS[Number(p.goal.due.slice(5, 7)) - 1];
  const highlight = `${p.goal.name.trim().toLowerCase()}, ${money(p.goal.target, { whole: true, currency: p.currency })} by ${month}`;
  return { text: `You're saving for ${highlight}.`, highlight };
}

export function paydayMemory(p: Partial<Profile>): MemoryDraft | null {
  if (p.payday === "irregular") return { text: "Your income is irregular, so plan week by week.", highlight: "irregular" };
  if (typeof p.payday !== "number") return null;
  const highlight = `paid on the ${ordinal(p.payday)}`;
  return { text: `You're ${highlight}.`, highlight };
}

export function limitMemory(p: Partial<Profile>): MemoryDraft | null {
  if (!p.limit || !(p.limit.amount > 0)) return null;
  const highlight = `under ${money(p.limit.amount, { whole: true, currency: p.currency })} a month`;
  return { text: `Keep ${CATEGORIES[p.limit.category].toLowerCase()} ${highlight}.`, highlight };
}

/** The facts saved to Walrus Memory when onboarding finishes. */
export function memoriesFromProfile(p: Partial<Profile>): MemoryDraft[] {
  return [goalMemory(p), paydayMemory(p), limitMemory(p)].filter((m): m is MemoryDraft => m !== null);
}

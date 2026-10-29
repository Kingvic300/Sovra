import { CATEGORY_LABELS, type CategoryId } from "./categories.js";

/** Memory sentences use the same wording as the frontend onboarding preview. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

export function goalSentence(goal: { name: string; target: number; due: string }) {
  const month = MONTHS[Number(goal.due.slice(5, 7)) - 1] ?? goal.due;
  return `You're saving for ${goal.name.trim().toLowerCase()}, ${usd(goal.target)} by ${month}.`;
}

export function limitSentence(limit: { category: CategoryId; amount: number }) {
  return `Keep ${CATEGORY_LABELS[limit.category].toLowerCase()} under ${usd(limit.amount)} a month.`;
}

export function paydaySentence(payday: number | "irregular") {
  return payday === "irregular"
    ? "Your income is irregular, so plan from your lowest recent month."
    : `You're paid on the ${ordinal(payday)}, so a low balance the week before is normal.`;
}

export function categoryRuleSentence(merchant: string, category: CategoryId) {
  return `${merchant} transactions are ${CATEGORY_LABELS[category].toLowerCase()}.`;
}

export function recurringDecisionSentence(merchant: string, status: "active" | "paused", on: Date, categoryLabel: string) {
  const day = `${on.getUTCDate()} ${MONTHS[on.getUTCMonth()].slice(0, 3)}`;
  return status === "paused"
    ? `You paused ${merchant} in Sovra on ${day}, so it no longer counts against your ${categoryLabel.toLowerCase()} budget.`
    : `You resumed ${merchant} in Sovra on ${day}, so it counts against your ${categoryLabel.toLowerCase()} budget again.`;
}

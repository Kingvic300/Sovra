import type { Tone } from "@/components/ui/progress";

/** Picks a tone from how full a budget is, counting committed renewals. */
export function budgetTone(spent: number, limit: number, committed = 0): Tone {
  return (spent + committed) / limit >= 0.8 ? "caution" : "gain";
}

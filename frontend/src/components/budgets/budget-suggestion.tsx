import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/app-data";
import { CATEGORIES, type BudgetSuggestion } from "@/lib/demo-data";
import { money } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

export function BudgetSuggestionCard({ suggestion: s }: { suggestion: BudgetSuggestion }) {
  const { data, upsertBudget, decideSuggestion, removeMemory, markAnswered } = useAppData();
  const toast = useToast();
  const label = CATEGORIES[s.category];
  const answerId = `suggestion-${s.id}`;
  const budget = data.budgets.find((b) => b.category === s.category);
  const applied = budget?.limit === s.to;
  const kept = data.answered.includes(answerId) && !applied;
  // The backend records the answer for good, so live answers have no undo.
  const live = data.source === "live";

  function apply() {
    if (!budget) return;
    const before = budget;
    const memoryId = decideSuggestion(s, "accepted", {
      kind: "limit",
      text: `Keep ${label.toLowerCase()} under ${money(s.to, { whole: true })} a month.`,
      highlight: `under ${money(s.to, { whole: true })} a month`,
      source: "You accepted a suggestion",
    });
    toast.success({
      title: `${label} limit is now ${money(s.to, { whole: true })}`,
      description: "Your budget and memory are updated.",
      action: live
        ? undefined
        : {
            label: "Undo",
            onClick: () => {
              upsertBudget(before);
              markAnswered(answerId, false);
              if (memoryId) removeMemory(memoryId);
            },
          },
    });
  }

  function keep() {
    const memoryId = decideSuggestion(s, "dismissed", {
      kind: "decision",
      text: `You kept ${label.toLowerCase()} at ${money(s.from, { whole: true })} a month.`,
      highlight: `kept ${label.toLowerCase()} at ${money(s.from, { whole: true })}`,
      source: "You answered a suggestion",
    });
    toast.info({
      title: `${label} stays at ${money(s.from, { whole: true })}`,
      description: "Sovra won't suggest this again for 3 months.",
      action: live
        ? undefined
        : {
            label: "Undo",
            onClick: () => {
              markAnswered(answerId, false);
              if (memoryId) removeMemory(memoryId);
            },
          },
    });
  }

  return (
    <article className="rounded-card bg-card p-5 shadow-card">
      <p className="font-semibold">
        {label}: {money(s.from, { whole: true })} to {money(s.to, { whole: true })}
      </p>
      <p className="mt-1.5 text-muted">{s.text}</p>
      <div className="mt-4">
        {applied || kept ? (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-gain">
            <Check className="size-4" aria-hidden />
            {applied
              ? `${label} limit set to ${money(s.to, { whole: true })}. Saved to memory.`
              : `Kept at ${money(s.from, { whole: true })}. Sovra won't suggest this again for 3 months.`}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={apply} disabled={!budget}>
              Change to {money(s.to, { whole: true })}
            </Button>
            <Button size="sm" variant="secondary" onClick={keep}>
              Keep {money(s.from, { whole: true })}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

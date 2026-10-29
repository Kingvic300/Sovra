import { useState } from "react";
import { Plus } from "lucide-react";
import { AddBudgetDialog } from "@/components/budgets/add-budget-dialog";
import { BudgetSuggestionCard } from "@/components/budgets/budget-suggestion";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { budgetViews, useAppData } from "@/lib/app-data";
import { budgetTone } from "@/lib/budget-tone";
import { BUDGET_SUGGESTIONS, CATEGORIES } from "@/lib/demo-data";
import { daysBetween, money, monthName } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export default function BudgetsPage() {
  useTitle("Budgets");
  const { data } = useAppData();
  const [adding, setAdding] = useState(false);
  const budgets = budgetViews(data);
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const daysLeft = daysBetween(data.today, data.monthEnd);
  // Suggestions are written for the sample story; live ones show only where that budget exists.
  const suggestions = BUDGET_SUGGESTIONS.filter((s) => data.source === "sample" || data.budgets.some((b) => b.category === s.category));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${monthName(data.today)} budgets`}
        description={`${money(totalSpent, { whole: true })} of ${money(totalLimit, { whole: true })} spent, ${daysLeft} days left in the month. Hatched segments are renewals already scheduled.`}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add budget
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <ul className="flex flex-col divide-y divide-line">
            {budgets.map((b) => (
              <li key={b.category} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{CATEGORIES[b.category]}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{money(b.spent, { whole: true })}</span>{" "}
                    <span className="text-[13px] text-muted">of {money(b.limit, { whole: true })}</span>
                  </span>
                </div>
                <div className="mt-2">
                  <Progress
                    value={b.spent}
                    max={b.limit}
                    committed={b.committed}
                    tone={budgetTone(b.spent, b.limit, b.committed)}
                    label={`${CATEGORIES[b.category]} budget`}
                  />
                </div>
                <p className={`mt-1.5 text-[13px] ${b.over ? "text-over" : "text-muted"}`}>
                  {b.over
                    ? b.committed
                      ? `${b.committedLabel} put you ${money(-b.left, { whole: true })} over`
                      : `${money(-b.left, { whole: true })} over`
                    : `${money(b.left, { whole: true })} left${b.committed ? ` after ${b.committedLabel}` : ""}`}
                </p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-3 text-[14px] font-semibold text-muted transition-colors hover:border-cobalt/50 hover:text-cobalt"
          >
            <Plus className="size-4" aria-hidden />
            Add a budget
          </button>
        </Panel>

        <div className="flex flex-col gap-4">
          {suggestions.length > 0 && <h2 className="text-[15px] font-semibold">Suggested from your history</h2>}
          {suggestions.map((s) => (
            <BudgetSuggestionCard key={s.id} suggestion={s} />
          ))}
        </div>
      </div>

      <AddBudgetDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Field, MoneyInput } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { Remembered } from "@/components/ui/remembered";
import { spentThisMonth, useAppData } from "@/lib/app-data";
import { CATEGORIES, type CategoryId } from "@/lib/demo-data";
import { money, monthName, niceAmount } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

/** Categories that can have a spending limit. */
const BUDGETABLE = (Object.keys(CATEGORIES) as CategoryId[]).filter(
  (c) => c !== "income" && c !== "transfer" && c !== "uncategorized",
);
/** In dollars; shown as round amounts worth about the same in the user's currency. */
const QUICK_AMOUNTS = [50, 100, 200, 300];

function AddBudgetForm({ onDone }: { onDone: () => void }) {
  const { data, upsertBudget, addMemory } = useAppData();
  const toast = useToast();
  const taken = new Set(data.budgets.map((b) => b.category));
  const available = BUDGETABLE.filter((c) => !taken.has(c));
  const [category, setCategory] = useState<CategoryId | null>(available[0] ?? null);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState<{ category?: string; limit?: string }>({});

  const spent = category ? spentThisMonth(data, category) : 0;
  const preview =
    category && limit > 0
      ? {
          text: `Keep ${CATEGORIES[category].toLowerCase()} under ${money(limit, { whole: true })} a month.`,
          highlight: `under ${money(limit, { whole: true })} a month`,
        }
      : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      category: category ? undefined : "Pick a category.",
      limit: limit > 0 ? undefined : "Enter a monthly limit above $0.",
    };
    setError(next);
    if (!category || !(limit > 0)) return;

    upsertBudget({ category, limit, spent });
    addMemory({ kind: "limit", text: preview!.text, highlight: preview!.highlight, source: "You added a budget" });
    toast.success({
      title: `${CATEGORIES[category]} budget added`,
      description:
        spent > limit
          ? `You've already spent ${money(spent, { whole: true })} this month, so it starts over the limit.`
          : `${money(limit - spent, { whole: true })} left for ${monthName(data.today)}. Saved to memory.`,
    });
    onDone();
  }

  if (!available.length) {
    return (
      <div className="px-6 py-6">
        <p>Every category already has a budget. Change a limit from its suggestion card, or remove one first.</p>
        <Button className="mt-5" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-col gap-6 px-6 py-6">
        <div>
          <p className="mb-2 text-[14px] font-semibold">Category</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
            {BUDGETABLE.map((c) => (
              <Chip key={c} active={category === c} disabled={taken.has(c)} onClick={() => setCategory(c)}>
                {CATEGORIES[c]}
              </Chip>
            ))}
          </div>
          {error.category ? (
            <p role="alert" className="mt-2 text-[13px] text-over">
              {error.category}
            </p>
          ) : (
            category && (
              <p className="mt-2 text-[13px] text-muted">
                You've spent <span className="font-semibold text-ink">{money(spent)}</span> on{" "}
                {CATEGORIES[category].toLowerCase()} so far in {monthName(data.today)}.
              </p>
            )
          )}
        </div>

        <div>
          <Field label="Monthly limit" error={error.limit}>
            <MoneyInput value={limit} onChange={setLimit} placeholder="100" autoFocus />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((usd) => niceAmount(usd, data.perUsd)).map((a) => (
              <Chip key={a} active={limit === a} onClick={() => setLimit(a)}>
                {money(a, { whole: true })}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-porcelain px-4 py-3.5 text-[15px]">
          <p className="mb-1 text-[13px] font-semibold text-muted">Sovra will remember</p>
          {preview ? (
            <Remembered text={preview.text} highlight={preview.highlight} />
          ) : (
            <span className="text-muted">Pick a category and a limit.</span>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Add budget</Button>
      </div>
    </form>
  );
}

export function AddBudgetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a budget" description="Set a monthly limit. Renewals are counted before they land.">
      <AddBudgetForm onDone={onClose} />
    </Modal>
  );
}

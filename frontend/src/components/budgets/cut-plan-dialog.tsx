import { useCallback, useEffect, useState } from "react";
import { Check, Pause, Scissors, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { CATEGORIES, type CategoryId } from "@/lib/demo-data";
import { money, monthName } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

/** POST /budgets/cuts. Every amount is computed by the backend from the user's data. */
type Cut = {
  id: string;
  kind: "pause" | "skip";
  category: CategoryId;
  merchant: string;
  recurringId: string | null;
  visits: number | null;
  perVisit: number | null;
  saving: number;
  why: string;
  memory: string | null;
};
type CutPlan = {
  status: "planned" | "on_track" | "nothing_to_cut";
  by: "ai" | "rules" | null;
  summary: string;
  note?: string | null;
  cuts: Cut[];
  kept: { id: string; merchant: string; why: string }[];
  targets: { category: CategoryId; label: string; limit: number; projected: number; after: number }[];
  totalSaving: number;
  closesGap: boolean;
};

function CutRow({ cut, done, onDo }: { cut: Cut; done: boolean; onDo: () => void }) {
  const what =
    cut.kind === "pause"
      ? `Pause ${cut.merchant}`
      : `Skip ${cut.visits} ${cut.merchant} ${cut.visits === 1 ? "visit" : "visits"}`;
  return (
    <li className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{what}</span>
        <span className="shrink-0 font-semibold text-gain tabular-nums">saves {money(cut.saving)}</span>
      </div>
      <p className="text-[14px] text-muted">{cut.why}</p>
      {cut.memory && (
        <p className="text-[13px]">
          <span className="text-muted">Because you told Sovra: </span>
          <mark className="remembered text-ink">{cut.memory}</mark>
        </p>
      )}
      <div>
        {done ? (
          <p role="status" className="flex items-center gap-2 text-[14px] font-medium text-gain">
            <Check className="size-4" aria-hidden />
            {cut.kind === "pause" ? `Paused in Sovra. Cancel it with ${cut.merchant} too.` : "Saved to memory."}
          </p>
        ) : (
          <Button size="sm" variant="secondary" onClick={onDo}>
            {cut.kind === "pause" ? <Pause className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            {cut.kind === "pause" ? "Pause in Sovra" : "I'll do this"}
          </Button>
        )}
      </div>
    </li>
  );
}

function Plan({ category }: { category?: CategoryId }) {
  const { data, setRecurringStatus, addMemory } = useAppData();
  const toast = useToast();
  const [plan, setPlan] = useState<CutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const fetchPlan = useCallback(
    () =>
      api<CutPlan>("/budgets/cuts", { method: "POST", json: category ? { category } : {} })
        .then(setPlan)
        .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Sovra couldn't make a plan. Try again.")),
    [category],
  );

  // The dialog mounts this when it opens, so each opening asks for a fresh plan.
  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  function retry() {
    setError(null);
    void fetchPlan();
  }

  function act(cut: Cut) {
    const label = CATEGORIES[cut.category].toLowerCase();
    if (cut.kind === "pause" && cut.recurringId) {
      setRecurringStatus(cut.recurringId, "paused");
      toast.success({
        title: `${cut.merchant} paused in Sovra`,
        description: `${money(cut.saving)} no longer counts against your ${label} budget. Cancel or pause it with ${cut.merchant} too; Sovra can't change it for you.`,
      });
    } else {
      const visits = `${cut.visits} ${cut.merchant} ${cut.visits === 1 ? "visit" : "visits"}`;
      addMemory({
        kind: "decision",
        text: `You plan to skip ${visits} in ${monthName(data.today)} to stay under your ${label} limit.`,
        highlight: `skip ${visits}`,
        source: "You chose a cut plan",
      });
      toast.success({ title: "Saved to memory", description: `Sovra will remember you're skipping ${visits} this month.` });
    }
    setDone((d) => new Set(d).add(cut.id));
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4 px-6 py-6">
        <p role="alert" className="text-over">{error}</p>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-3 px-6 py-6" aria-busy="true">
        <p className="text-[14px] text-muted">Sovra is going through your renewals and spending habits…</p>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <p className="flex items-start gap-2.5">
        {plan.by === "ai" ? (
          <Sparkles className="mt-0.5 size-5 shrink-0 text-cobalt" aria-hidden />
        ) : (
          <Scissors className="mt-0.5 size-5 shrink-0 text-cobalt" aria-hidden />
        )}
        <span>{plan.summary}</span>
      </p>
      {plan.note && <p className="rounded-xl bg-porcelain px-4 py-3 text-[14px] text-muted">{plan.note}</p>}

      {plan.cuts.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {plan.cuts.map((c) => (
            <CutRow key={c.id} cut={c} done={done.has(c.id)} onDo={() => act(c)} />
          ))}
        </ul>
      )}

      {plan.kept.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">Not cutting</h3>
          <ul className="flex flex-col gap-2">
            {plan.kept.map((k) => (
              <li key={k.id} className="flex items-start gap-2.5 text-[14px]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gain" aria-hidden />
                <span>
                  <span className="font-semibold">{k.merchant}:</span> {k.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.cuts.length > 0 && (
        <div className="rounded-xl bg-porcelain px-4 py-3 text-[14px]">
          <p className="font-semibold">Saves {money(plan.totalSaving)} this month</p>
          {plan.targets.map((t) => (
            <p key={t.category} className={t.after > t.limit ? "text-over" : "text-muted"}>
              {t.label}: {money(t.projected, { whole: true })} to {money(t.after, { whole: true })} of{" "}
              {money(t.limit, { whole: true })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** "What should I cut?" for one over-budget category, or every one when `category` is left out. */
export function CutPlanDialog({ open, onClose, category }: { open: boolean; onClose: () => void; category?: CategoryId }) {
  const title = category ? `What to cut from ${CATEGORIES[category].toLowerCase()}` : "What to cut this month";
  return (
    <Modal open={open} onClose={onClose} title={title} description="Suggested from your renewals, habits and what you've told Sovra.">
      <Plan category={category} />
    </Modal>
  );
}

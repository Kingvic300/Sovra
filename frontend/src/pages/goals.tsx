import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { GOALS } from "@/lib/demo-data";
import { money, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export default function GoalsPage() {
  useTitle("Goals");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals"
        description="Sovra weighs every spending question against these. Tell it a new goal in Ask Sovra or add one here."
        action={
          <Button>
            <Plus className="size-4" aria-hidden />
            Add goal
          </Button>
        }
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {GOALS.map((g) => {
          const pct = Math.round((g.saved / g.target) * 100);
          return (
            <article key={g.id} className="flex flex-col rounded-card bg-card p-6 shadow-card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{g.name}</h2>
                <span className="text-[13px] text-muted">by {shortDate(g.due)} {g.due.slice(0, 4)}</span>
              </div>
              <p className="mt-4 text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                {money(g.saved, { whole: true })}{" "}
                <span className="text-xl font-bold text-muted">of {money(g.target, { whole: true })}</span>
              </p>
              <div className="mt-4">
                <Progress value={g.saved} max={g.target} tone="cobalt" size="lg" label={`${g.name} progress`} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px]">
                <div>
                  <dt className="text-muted">Saved</dt>
                  <dd className="font-semibold tabular-nums">{pct}%</dd>
                </div>
                <div>
                  <dt className="text-muted">Still needed</dt>
                  <dd className="font-semibold tabular-nums">{money(g.target - g.saved, { whole: true })}</dd>
                </div>
                <div>
                  <dt className="text-muted">Weekly</dt>
                  <dd className="font-semibold tabular-nums">{money(g.weekly, { whole: true })}</dd>
                </div>
              </dl>
              <p className="mt-4 text-muted">{g.note}</p>
            </article>
          );
        })}
        <button
          type="button"
          className="flex flex-col items-start justify-center gap-2 rounded-card border-2 border-dashed border-line p-6 text-left transition-colors hover:border-cobalt/50 hover:bg-card/60"
        >
          <span className="grid size-9 place-items-center rounded-full bg-cobalt-soft text-cobalt">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold">New goal</span>
          <span className="max-w-[40ch] text-muted">
            Tell Sovra what you're saving for. It plans a weekly amount around your bills and payday.
          </span>
        </button>
      </div>
    </div>
  );
}

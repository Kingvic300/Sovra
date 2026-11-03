import { useState } from "react";
import { Plus } from "lucide-react";
import { AddGoalDialog } from "@/components/goals/add-goal-dialog";
import { SavingsForecastPanel } from "@/components/goals/savings-forecast-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { useAppData } from "@/lib/app-data";
import { money, shortDate } from "@/lib/format";
import { forecastSavings } from "@/lib/savings-forecast";
import { useTitle } from "@/lib/use-title";

export default function GoalsPage() {
  useTitle("Goals");
  const { data } = useAppData();
  const [adding, setAdding] = useState(false);
  const forecast = forecastSavings(data.transactions, data.goals, data.today);
  const goalForecast = (id: string) => (forecast.status === "ready" ? forecast.goals.find((f) => f.goalId === id) : undefined);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals"
        description="Sovra weighs every spending question against these. It never moves money, so the saved amount is what you enter. From your statement, Sovra estimates what you could put aside and when you'd get there."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add goal
          </Button>
        }
      />

      <SavingsForecastPanel forecast={forecast} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data.goals.map((g) => {
          const pct = Math.round((g.saved / g.target) * 100);
          const f = goalForecast(g.id);
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
              {f && f.remaining > 0 && (
                <p className={`mt-2 text-[14px] font-medium ${f.onTrack ? "text-gain" : "text-caution"}`}>
                  {f.onTrack
                    ? `On track: your statement leaves enough for ${money(f.neededPerMonth, { whole: true })} a month${f.reachBy ? `, reached around ${shortDate(f.reachBy)} ${f.reachBy.slice(0, 4)}` : ""}.`
                    : f.reachBy
                      ? `At what you keep now, you'd reach it around ${shortDate(f.reachBy)} ${f.reachBy.slice(0, 4)}. Keep ${money(f.shortBy, { whole: true })} more a month to make the date.`
                      : `Your statement shows nothing left over each month. You'd need ${money(f.neededPerMonth, { whole: true })} a month for this goal.`}
                </p>
              )}
            </article>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[220px] flex-col items-start justify-center gap-2 rounded-card border-2 border-dashed border-field/60 p-6 text-left transition-colors hover:border-cobalt/50 hover:bg-card/60"
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

      <AddGoalDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

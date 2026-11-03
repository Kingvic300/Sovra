import { Link } from "react-router";
import { FileUp, TrendingDown, TrendingUp } from "lucide-react";
import { money, monthName } from "@/lib/format";
import type { SavingsForecast } from "@/lib/savings-forecast";

/** What the statement says the user saves each month. Shown above the goals. */
export function SavingsForecastPanel({ forecast }: { forecast: SavingsForecast }) {
  if (forecast.status === "no_statement") {
    return (
      <section className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cobalt-soft text-cobalt">
            <FileUp className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold">Sovra can't see what you save yet</h2>
            <p className="mt-1 max-w-[60ch] text-muted">
              Import a bank statement and Sovra works out what you earn, spend and keep each month, then tells you whether each goal is on track.
              Until then it only knows the amounts you type in.
            </p>
          </div>
        </div>
        <Link to="/app/accounts" className="shrink-0 font-semibold text-cobalt hover:underline">
          Import a statement
        </Link>
      </section>
    );
  }

  const saving = forecast.avgNet >= 0;
  const span = forecast.months.length === 1 ? monthName(`${forecast.months[0].month}-01`) : `the last ${forecast.months.length} months`;
  return (
    <section className="rounded-card bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${saving ? "bg-gain/10 text-gain" : "bg-over/10 text-over"}`}>
          {saving ? <TrendingUp className="size-5" aria-hidden /> : <TrendingDown className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">
            {saving
              ? `From your statement, you keep about ${money(forecast.avgNet, { whole: true })} a month`
              : `From your statement, you spend about ${money(-forecast.avgNet, { whole: true })} a month more than comes in`}
          </h2>
          <p className="mt-1 text-muted">
            Based on {span}
            {forecast.partial ? " so far" : ""}: {money(forecast.avgIncome, { whole: true })} in, {money(forecast.avgSpent, { whole: true })} out on average.
            {forecast.partial ? " This month isn't over, so the estimate will move." : ""}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px]">
        {forecast.months.map((m) => (
          <div key={m.month}>
            <dt className="text-muted">{monthName(`${m.month}-01`)}</dt>
            <dd className={`font-semibold tabular-nums ${m.net < 0 ? "text-over" : ""}`}>
              {m.net < 0 ? "−" : "+"}
              {money(Math.abs(m.net), { whole: true })}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

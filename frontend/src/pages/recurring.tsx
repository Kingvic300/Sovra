import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { RecurringRow } from "@/components/recurring/recurring-row";
import { useAppData } from "@/lib/app-data";
import { daysBetween, money } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export default function RecurringPage() {
  useTitle("Recurring");
  const { data } = useAppData();
  const active = data.recurring.filter((r) => r.status === "active").sort((a, b) => a.next.localeCompare(b.next));
  const paused = data.recurring.filter((r) => r.status === "paused");
  const thisWeek = active.filter((r) => daysBetween(data.today, r.next) <= 7);
  const later = active.filter((r) => daysBetween(data.today, r.next) > 7);
  const monthly = active.reduce((s, r) => s + r.amount, 0);
  const weekTotal = thisWeek.reduce((s, r) => s + r.amount, 0);
  const savedByPausing = paused.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recurring"
        description="Bills and subscriptions Sovra found in your transactions. It reminds you before each one and remembers what you decided last time."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Every month", value: money(monthly) },
          { label: "Due in the next 7 days", value: money(weekTotal) },
          { label: "Saved by pausing", value: `${money(savedByPausing)} a month` },
        ].map((s) => (
          <div key={s.label} className="rounded-card bg-card px-5 py-4 shadow-card">
            <p className="text-[13px] text-muted">{s.label}</p>
            <p className="mt-0.5 text-2xl font-extrabold tracking-[-0.02em] tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Panel title="Next 7 days">
            <ul className="divide-y divide-line">
              {thisWeek.map((r) => (
                <RecurringRow key={r.id} r={r} />
              ))}
            </ul>
          </Panel>

          {paused.length > 0 && (
            <Panel title="Paused">
              <ul className="divide-y divide-line">
                {paused.map((r) => (
                  <RecurringRow key={r.id} r={r} />
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Later">
          <ul className="divide-y divide-line">
            {later.map((r) => (
              <RecurringRow key={r.id} r={r} />
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

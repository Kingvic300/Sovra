import { ChatThread } from "@/components/ask/chat-thread";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Remembered } from "@/components/ui/remembered";
import { useAppData } from "@/lib/app-data";
import { CHAT, TODAY } from "@/lib/demo-data";
import { daysBetween, money, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export default function AskPage() {
  useTitle("Ask Sovra");
  const { data } = useAppData();
  const upcoming = data.recurring.filter((r) => r.status === "active" && daysBetween(TODAY, r.next) <= 7);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ask Sovra"
        description="Ask anything about your money. Answers use your real numbers and what Sovra remembers about your goals."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
        <ChatThread initial={CHAT} />

        <aside className="flex flex-col gap-5" aria-label="What Sovra uses to answer">
          <Panel title="Sovra keeps in mind">
            <ul className="flex flex-col gap-2.5 text-[14px]">
              {[...data.memories].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Remembered text={m.text} highlight={m.highlight} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Coming up this week">
            <ul className="flex flex-col gap-2 text-[14px]">
              {upcoming.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span>
                    {r.merchant} <span className="text-muted">{shortDate(r.next)}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Goals">
            <ul className="flex flex-col gap-2 text-[14px]">
              {data.goals.map((g) => (
                <li key={g.id} className="flex justify-between gap-3">
                  <span>{g.name}</span>
                  <span className="tabular-nums text-muted">
                    <span className="font-semibold text-ink">{money(g.saved, { whole: true })}</span> of{" "}
                    {money(g.target, { whole: true })}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

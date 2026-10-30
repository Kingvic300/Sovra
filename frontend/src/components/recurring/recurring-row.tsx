import { Pause, Play } from "lucide-react";
import { useAppData } from "@/lib/app-data";
import { CATEGORIES, type Recurring } from "@/lib/demo-data";
import { daysBetween, money, relativeDays, shortDate } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

export function RecurringRow({ r }: { r: Recurring }) {
  const { data, setRecurringStatus, removeMemory } = useAppData();
  const today = data.today;
  const toast = useToast();
  const days = daysBetween(today, r.next);
  const paused = r.status === "paused";
  const soon = !paused && days <= 3;
  const changedByUser = r.baseStatus !== undefined && r.baseStatus !== r.status;
  const note = changedByUser ? (paused ? "You paused this today" : "You resumed this today") : r.note;

  function toggle() {
    const next = paused ? "active" : "paused";
    const memoryId = setRecurringStatus(
      r.id,
      next,
      next === "paused"
        ? {
            kind: "decision",
            text: `You paused ${r.merchant} on ${shortDate(today)}.`,
            highlight: `paused ${r.merchant}`,
            source: "You chose on Recurring",
          }
        : {
            kind: "decision",
            text: `You resumed ${r.merchant} on ${shortDate(today)}.`,
            highlight: `resumed ${r.merchant}`,
            source: "You chose on Recurring",
          },
    );
    toast.success({
      title: next === "paused" ? `${r.merchant} paused in Sovra` : `${r.merchant} counted again`,
      description:
        next === "paused"
          ? `${money(r.amount)} no longer counts against your budget. Cancel or pause it with ${r.merchant} too; Sovra can't change it for you.`
          : `${money(r.amount)} is back in your budget from ${shortDate(r.next)}.`,
      action: {
        label: "Undo",
        onClick: () => {
          setRecurringStatus(r.id, r.status);
          if (memoryId) removeMemory(memoryId);
        },
      },
    });
  }

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[1fr_140px_96px_auto]">
      <div className="min-w-0">
        <p className="font-semibold">{r.merchant}</p>
        <p className="text-[13px] text-muted">
          {CATEGORIES[r.category]}
          {note && (
            <span className={`ml-2 ${r.warn && !paused && !changedByUser ? "text-over" : "text-cobalt"}`}>{note}</span>
          )}
        </p>
      </div>
      <p className={`order-3 text-[13px] sm:order-none ${soon ? "font-semibold text-caution" : "text-muted"}`}>
        {paused ? "Paused" : `${shortDate(r.next)}, ${relativeDays(days)}`}
      </p>
      <p className={`text-right font-semibold tabular-nums ${paused ? "text-muted line-through" : ""}`}>{money(r.amount)}</p>
      <button
        type="button"
        onClick={toggle}
        className="order-4 inline-flex h-8 items-center gap-1.5 justify-self-end rounded-lg border border-line px-3 text-[13px] font-semibold text-ink transition-colors hover:border-cobalt/50 sm:order-none"
      >
        {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        {paused ? "Resume" : "Pause"}
      </button>
    </li>
  );
}

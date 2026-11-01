import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bell, ChevronRight, CircleAlert, CircleCheck, Repeat, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { budgetViews, useAppData } from "@/lib/app-data";
import { CATEGORIES } from "@/lib/demo-data";
import { daysBetween, money, relativeDays } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";

type Alert = {
  id: string;
  icon: typeof Bell;
  title: string;
  body: string;
  to: string;
  tone: "over" | "caution";
  /** Set for reminders the backend keeps: dismissing one hides it for good. */
  dismiss?: () => void;
};

const TONES = {
  over: "bg-over-soft text-over",
  caution: "bg-caution-soft text-caution",
};

function AlertGroup({ label, alerts, onPick }: { label: string; alerts: Alert[]; onPick: () => void }) {
  if (!alerts.length) return null;
  return (
    <section>
      <h3 className="px-3 pt-3 pb-1 text-[13px] font-semibold text-muted">{label}</h3>
      <ul>
        {alerts.map((a) => (
          <li key={a.id} className="flex items-start">
            <Link to={a.to} onClick={onPick} className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-porcelain">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONES[a.tone]}`}>
                <a.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{a.title}</span>
                <span className="block text-[14px] text-muted">{a.body}</span>
              </span>
              <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted" aria-hidden />
            </Link>
            {a.dismiss && (
              <button
                type="button"
                onClick={a.dismiss}
                aria-label={`Dismiss: ${a.title}`}
                className="mt-3 grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-porcelain hover:text-ink pointer-coarse:size-11"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlertList({ alerts, onPick }: { alerts: Alert[]; onPick: () => void }) {
  if (!alerts.length) {
    return (
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-gain-soft text-gain">
          <CircleCheck className="size-6" aria-hidden />
        </span>
        <p className="mt-3 font-semibold">You're all caught up</p>
        <p className="mt-1 text-[14px] text-muted">Sovra will tell you before a bill renews or a budget runs over.</p>
      </div>
    );
  }
  return (
    <>
      <AlertGroup label="Needs attention" alerts={alerts.filter((a) => a.tone === "over")} onPick={onPick} />
      <AlertGroup label="Coming up" alerts={alerts.filter((a) => a.tone === "caution")} onPick={onPick} />
      <Link
        to="/app/recurring"
        onClick={onPick}
        className="mt-2 flex min-h-11 items-center justify-center rounded-xl text-[14px] font-semibold text-cobalt hover:bg-cobalt-soft"
      >
        See all bills and subscriptions
      </Link>
    </>
  );
}

/**
 * Bell with budgets going over and renewals due soon: the backend's reminders when live,
 * otherwise alerts built from the data on screen.
 */
export function NotificationsButton() {
  const { data, dismissReminder } = useAppData();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Phones get a bottom sheet like the rest of the mobile shell; wider screens a popover.
  const wide = useMediaQuery("(min-width: 640px)");

  useEffect(() => {
    if (!open || !wide) return;
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, wide]);

  const alerts: Alert[] = data.reminders
    ? data.reminders.map((r) => ({
        id: r.id,
        icon: r.kind === "renewal" ? Repeat : CircleAlert,
        title: r.title,
        body: r.body,
        to: r.to,
        tone: r.tone,
        dismiss: () => dismissReminder(r.id),
      }))
    : [
        ...budgetViews(data)
          .filter((b) => b.over)
          .map((b) => ({
            id: `budget-${b.category}`,
            icon: CircleAlert,
            title: `${CATEGORIES[b.category]} will go over`,
            body: b.renewalSentence
              ? `${b.renewalSentence}, taking it to ${money(b.projected, { whole: true })} of ${money(b.limit, { whole: true })}.`
              : `Spending is at ${money(b.projected, { whole: true })} of ${money(b.limit, { whole: true })}.`,
            to: "/app/budgets",
            tone: "over" as const,
          })),
        ...data.recurring
          .filter((r) => r.status === "active" && r.next >= data.today && daysBetween(data.today, r.next) <= 3)
          .map((r) => ({
            id: `renewal-${r.id}`,
            icon: Repeat,
            title: `${r.merchant} renews ${relativeDays(daysBetween(data.today, r.next))}`,
            body: `${money(r.amount)} from your ${CATEGORIES[r.category].toLowerCase()} budget.`,
            to: "/app/recurring",
            tone: "caution" as const,
          })),
      ];
  const close = () => setOpen(false);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup={wide ? "true" : "dialog"}
        aria-label={alerts.length ? `Notifications, ${alerts.length} new` : "Notifications"}
        className="relative grid size-11 place-items-center rounded-full text-ink transition-colors hover:bg-card"
      >
        <Bell className="size-[22px]" strokeWidth={1.9} aria-hidden />
        {alerts.length > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-[18px] place-items-center rounded-full bg-over px-1 text-[10px] leading-[18px] font-bold text-white" aria-hidden>
            {alerts.length}
          </span>
        )}
      </button>

      {wide ? (
        open && (
          <div className="absolute right-0 z-40 mt-2 w-[400px] overflow-hidden rounded-card bg-card shadow-pop ring-1 ring-line">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-bold">Notifications</h2>
              {alerts.length > 0 && (
                <span className="rounded-full bg-over-soft px-2 py-0.5 text-[12px] font-semibold text-over">{alerts.length} new</span>
              )}
            </div>
            <div className="max-h-[70dvh] overflow-y-auto overscroll-contain px-2 pb-2">
              <AlertList alerts={alerts} onPick={close} />
            </div>
          </div>
        )
      ) : (
        <BottomSheet open={open} onClose={close} title="Notifications">
          <AlertList alerts={alerts} onPick={close} />
        </BottomSheet>
      )}
    </div>
  );
}

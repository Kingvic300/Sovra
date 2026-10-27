import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bell, CircleAlert, Repeat } from "lucide-react";
import { budgetViews, useAppData } from "@/lib/app-data";
import { CATEGORIES, TODAY } from "@/lib/demo-data";
import { daysBetween, money, relativeDays } from "@/lib/format";

type Alert = { id: string; icon: typeof Bell; title: string; body: string; to: string; tone: "over" | "caution" };

/** Bell with alerts built from the user's data: budgets going over and renewals due soon. */
export function NotificationsButton() {
  const { data } = useAppData();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const alerts: Alert[] = [
    ...budgetViews(data)
      .filter((b) => b.over)
      .map((b) => ({
        id: `budget-${b.category}`,
        icon: CircleAlert,
        title: `${CATEGORIES[b.category]} will go over`,
        body: b.renewalSentence
          ? `${b.renewalSentence}, taking it to ${money(b.projected, { whole: true })} of ${money(b.limit, { whole: true })}.`
          : `Spending is at ${money(b.projected, { whole: true })} of ${money(b.limit, { whole: true })}.`,
        to: "/app",
        tone: "over" as const,
      })),
    ...data.recurring
      .filter((r) => r.status === "active" && daysBetween(TODAY, r.next) <= 3)
      .map((r) => ({
        id: `renewal-${r.id}`,
        icon: Repeat,
        title: `${r.merchant} renews ${relativeDays(daysBetween(TODAY, r.next))}`,
        body: `${money(r.amount)} from your ${CATEGORIES[r.category].toLowerCase()} budget.`,
        to: "/app/recurring",
        tone: "caution" as const,
      })),
  ];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
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

      {open && (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-40 overflow-hidden rounded-card bg-card shadow-pop ring-1 ring-line sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96">
          <p className="border-b border-line px-4 py-3 font-semibold">Notifications</p>
          {alerts.length ? (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link to={a.to} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3.5 hover:bg-porcelain">
                    <a.icon className={`mt-0.5 size-5 shrink-0 ${a.tone === "over" ? "text-over" : "text-caution"}`} aria-hidden />
                    <span>
                      <span className="block font-semibold">{a.title}</span>
                      <span className="block text-[14px] text-muted">{a.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-muted">You're all caught up. Sovra will tell you before anything renews.</p>
          )}
        </div>
      )}
    </div>
  );
}

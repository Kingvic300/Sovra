import { Link, useLocation } from "react-router";
import type { ShellStats } from "@/lib/app-data";
import { money } from "@/lib/format";
import { Wordmark } from "./logo";
import { isActive, navGroups, type NavBadge } from "./nav-items";

function Badge({ badge }: { badge: NavBadge }) {
  return badge.tone === "caution" ? (
    <span className="ml-auto rounded-full bg-caution-soft px-1.5 py-px text-[11px] font-semibold text-caution">
      {badge.text}
    </span>
  ) : (
    <span className="ml-auto text-[12px] tabular-nums text-muted">{badge.text}</span>
  );
}

/** Desktop navigation. Mobile navigation lives in the top bar. */
export function Sidebar({ stats }: { stats: ShellStats }) {
  const { pathname } = useLocation();
  const perDay = stats.daysToPayday > 0 ? stats.freeUntilPayday / stats.daysToPayday : stats.freeUntilPayday;

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-line px-4 py-5 lg:flex">
      <Link to="/app" className="px-2.5 text-[21px]" aria-label="Sovra overview">
        <Wordmark />
      </Link>

      <nav aria-label="Main" className="mt-7 flex flex-col gap-5">
        {navGroups(stats).map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2.5 text-[12px] font-medium text-muted/80">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      to={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-2.5 py-2 font-medium transition-colors ${
                        active ? "bg-card text-ink shadow-card" : "text-muted hover:bg-card/50 hover:text-ink"
                      }`}
                    >
                      <Icon className={`size-[18px] ${active ? "text-cobalt" : ""}`} strokeWidth={1.9} aria-hidden />
                      {label}
                      {badge && <Badge badge={badge} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <section className="mt-auto rounded-card bg-card p-4 shadow-card" aria-label="Free until payday">
        <p className="text-[13px] text-muted">Free until payday</p>
        <p className="mt-0.5 text-[26px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">
          {money(stats.freeUntilPayday, { whole: true })}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          About <span className="font-semibold text-ink">{money(perDay, { whole: true })} a day</span> for{" "}
          {stats.daysToPayday} days. Sovra counts rent and renewals first.
        </p>
      </section>
    </aside>
  );
}

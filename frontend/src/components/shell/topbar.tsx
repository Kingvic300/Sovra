import { Link, useLocation } from "react-router";
import { MessageSquareText } from "lucide-react";
import { TopUpButton } from "@/components/topup/top-up-button";
import type { ShellStats } from "@/lib/app-data";
import { Logo } from "./logo";
import { isActive, navGroups } from "./nav-items";
import { ProfileMenu } from "./profile-menu";

function StatusPill({ to, live, children }: { to: string; live: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-[13px] text-muted shadow-card transition-colors hover:text-ink"
    >
      <span className="relative flex size-2">
        {live && <span className="absolute inset-0 animate-ping rounded-full bg-gain opacity-40 motion-reduce:hidden" />}
        <span className={`relative size-2 rounded-full ${live ? "bg-gain" : "bg-muted"}`} />
      </span>
      {children}
    </Link>
  );
}

export function Topbar({ stats }: { stats: ShellStats }) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-porcelain/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10 2xl:px-12">
        <Link to="/app" className="lg:hidden" aria-label="Sovra overview">
          <Logo className="size-8" />
        </Link>

        <Link
          to="/app/ask"
          className="hidden h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-card px-4 text-muted transition-colors hover:border-cobalt/40 hover:text-ink sm:flex md:max-w-[440px]"
        >
          <MessageSquareText className="size-4 shrink-0 text-cobalt" aria-hidden />
          <span className="truncate">Ask Sovra about your money</span>
        </Link>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2 xl:flex">
            <StatusPill to="/app/memory" live>
              <span>
                <span className="font-semibold text-ink">{stats.memories} memories</span> on Walrus
              </span>
            </StatusPill>
            <StatusPill to="/app/accounts" live={stats.walletSyncedToday}>
              <span>
                Sui wallet <span className="font-semibold text-ink">live via Tatum</span>
              </span>
            </StatusPill>
          </div>
          <TopUpButton />
          <ProfileMenu />
        </div>
      </div>

      {/* Mobile navigation */}
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] lg:hidden">
        {navGroups(stats)
          .flatMap((g) => g.items)
          .map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                to={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium pointer-coarse:py-2.5 ${active ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            );
          })}
      </nav>
    </header>
  );
}

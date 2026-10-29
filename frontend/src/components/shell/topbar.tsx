import { Link, useLocation } from "react-router";
import { TopUpButton } from "@/components/topup/top-up-button";
import type { ShellStats } from "@/lib/app-data";
import { money } from "@/lib/format";
import { AskBar } from "./ask-bar";
import { Logo } from "./logo";
import { NotificationsButton } from "./notifications-button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileMenu } from "./profile-menu";

function StatusPill({ to, live, children }: { to: string; live: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-[13px] text-muted shadow-card ring-1 ring-line transition-colors hover:text-ink"
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
    <header className="sticky top-0 z-20 border-b border-line bg-porcelain/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      {/* Phones and small tablets: app icon, memory and balance pills, alerts, profile. Navigation is in the tab bar. */}
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:hidden">
        <Link to="/app" aria-label="Sovra overview" className="mr-auto">
          <Logo variant="tile" className="size-10" />
        </Link>
        <Link
          to="/app/memory"
          aria-label={`${stats.memories} memories on Walrus`}
          className="flex h-10 items-center gap-2 rounded-full bg-card px-3 text-[14px] font-semibold shadow-card ring-1 ring-line"
        >
          <span className="size-3 rounded-full bg-highlighter ring-2 ring-highlighter/40" aria-hidden />
          {stats.loading ? <Skeleton className="h-3.5 w-5" /> : stats.memories}
        </Link>
        <Link
          to="/app/accounts"
          aria-label={stats.walletBalance === null ? "Sui wallet" : `Sui wallet ${money(stats.walletBalance, { currency: "USD" })} USDC, live via Tatum`}
          className="flex h-10 items-center gap-2 rounded-full bg-card px-3 text-[14px] font-semibold tabular-nums shadow-card ring-1 ring-line"
        >
          <span className={`size-2 rounded-full ${stats.walletSyncedToday ? "bg-gain" : "bg-muted"}`} aria-hidden />
          {stats.loading ? (
            <Skeleton className="h-3.5 w-12" />
          ) : stats.walletBalance === null ? (
            "Wallet"
          ) : (
            money(stats.walletBalance, { whole: true, currency: "USD" })
          )}
        </Link>
        <NotificationsButton />
        <ProfileMenu />
      </div>

      {/* Desktop */}
      <div className="hidden h-16 items-center gap-3 px-10 lg:flex 2xl:px-12">
        {/* The Ask page has its own composer. */}
        {!pathname.startsWith("/app/ask") && <AskBar />}

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2 xl:flex">
            <StatusPill to="/app/memory" live>
              <span>
                {stats.loading ? (
                  <Skeleton className="inline-block h-3.5 w-24 align-middle" />
                ) : (
                  <>
                    <span className="font-semibold text-ink">{stats.memories} memories</span> on Walrus
                  </>
                )}
              </span>
            </StatusPill>
            <StatusPill to="/app/accounts" live={stats.walletSyncedToday}>
              <span>
                Sui wallet <span className="font-semibold text-ink">live via Tatum</span>
              </span>
            </StatusPill>
          </div>
          <NotificationsButton />
          <TopUpButton />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

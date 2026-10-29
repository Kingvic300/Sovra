import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ChartPie,
  ChevronRight,
  Ellipsis,
  Highlighter,
  House,
  Repeat,
  Target,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AddBudgetDialog } from "@/components/budgets/add-budget-dialog";
import { AddGoalDialog } from "@/components/goals/add-goal-dialog";
import { TopUpDialog } from "@/components/topup/top-up-dialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { ShellStats } from "@/lib/app-data";
import { Logo } from "./logo";
import { isActive } from "./nav-items";

type Tab = { href: string; label: string; icon: LucideIcon; badge?: number };
type Dialog = "topup" | "budget" | "goal" | null;

const MORE_ROUTES = ["/app/transactions", "/app/goals", "/app/recurring", "/app/accounts"];

function TabLink({ tab, pathname }: { tab: Tab; pathname: string }) {
  const active = isActive(pathname, tab.href);
  return (
    <Link
      to={tab.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
        active ? "font-semibold text-cobalt" : "font-medium text-muted hover:text-ink"
      }`}
    >
      {/* Not colour alone: the active tab also gets a bar and a bolder label. */}
      {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-cobalt" aria-hidden />}
      <span className="relative">
        <tab.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        {!!tab.badge && (
          <span className="absolute -top-1.5 -right-2.5 grid min-w-[18px] place-items-center rounded-full bg-caution px-1 text-[10px] leading-[18px] font-bold text-white">
            {tab.badge}
          </span>
        )}
      </span>
      {tab.label}
      {!!tab.badge && <span className="sr-only">, {tab.badge} need attention</span>}
    </Link>
  );
}

function SheetRow({
  icon: Icon,
  title,
  body,
  onClick,
  to,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  onClick?: () => void;
  to?: string;
  badge?: string;
}) {
  const inner = (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cobalt-soft text-cobalt">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {body && <span className="block text-[13px] text-muted">{body}</span>}
      </span>
      {badge && <span className="rounded-full bg-caution-soft px-2 py-0.5 text-[12px] font-semibold text-caution">{badge}</span>}
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
    </>
  );
  const cls = "flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-porcelain";
  return to ? (
    <Link to={to} onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** One-tap action at the top of the More sheet. */
function ActionTile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-center text-[12px] leading-tight font-medium transition-colors hover:bg-porcelain"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-cobalt-soft text-cobalt">
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </button>
  );
}

/** Raised centre tab: Ask Sovra is the app's main feature, one thumb-reach away on every screen. */
function AskTab({ pathname }: { pathname: string }) {
  const active = isActive(pathname, "/app/ask");
  return (
    <Link
      to="/app/ask"
      aria-current={active ? "page" : undefined}
      className="group flex min-h-14 flex-col items-center justify-end gap-1 pb-1.5 text-[11px] font-semibold text-cobalt"
    >
      <span
        className={`-mt-5 grid size-14 place-items-center rounded-2xl text-white shadow-pop ring-4 ring-card transition-[transform,background-color] group-hover:bg-cobalt-deep group-active:scale-95 ${
          active ? "bg-cobalt-deep" : "bg-cobalt"
        }`}
      >
        <Logo variant="white" className="size-7" />
      </span>
      Ask Sovra
    </Link>
  );
}

/** Bottom navigation for phones and small tablets. */
export function TabBar({ stats }: { stats: ShellStats }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<"more" | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const moreActive = MORE_ROUTES.some((r) => pathname.startsWith(r));

  function openDialog(d: Exclude<Dialog, null>) {
    setSheet(null);
    setDialog(d);
  }

  function go(path: string) {
    setSheet(null);
    navigate(path);
  }

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-[560px] grid-cols-5 items-center px-2">
          <TabLink tab={{ href: "/app", label: "Home", icon: House }} pathname={pathname} />
          <TabLink tab={{ href: "/app/budgets", label: "Budgets", icon: ChartPie, badge: stats.budgetsOver }} pathname={pathname} />
          <AskTab pathname={pathname} />
          <TabLink tab={{ href: "/app/memory", label: "Memory", icon: Highlighter }} pathname={pathname} />
          <button
            type="button"
            onClick={() => setSheet("more")}
            aria-haspopup="dialog"
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
              moreActive ? "font-semibold text-cobalt" : "font-medium text-muted hover:text-ink"
            }`}
          >
            {moreActive && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-cobalt" aria-hidden />}
            <span className="relative">
              <Ellipsis className="size-[22px]" strokeWidth={moreActive ? 2.2 : 1.8} aria-hidden />
              {!!stats.dueSoon && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-caution" aria-hidden />}
            </span>
            More
          </button>
        </div>
      </nav>

      <BottomSheet open={sheet === "more"} onClose={() => setSheet(null)} title="More">
        <div className="mb-2 grid grid-cols-4 gap-1 border-b border-line pb-3" role="group" aria-label="Quick actions">
          <ActionTile icon={ArrowDownToLine} label="Top up" onClick={() => openDialog("topup")} />
          <ActionTile icon={ChartPie} label="Add budget" onClick={() => openDialog("budget")} />
          <ActionTile icon={Target} label="Add goal" onClick={() => openDialog("goal")} />
          <ActionTile icon={Upload} label="Import" onClick={() => go("/app/accounts")} />
        </div>
        <SheetRow icon={ArrowLeftRight} title="Transactions" body={`${stats.transactions} this month`} onClick={() => go("/app/transactions")} />
        <SheetRow icon={Target} title="Goals" onClick={() => go("/app/goals")} />
        <SheetRow
          icon={Repeat}
          title="Recurring"
          body="Bills and subscriptions"
          badge={stats.dueSoon ? `${stats.dueSoon} due` : undefined}
          onClick={() => go("/app/recurring")}
        />
        <SheetRow icon={Wallet} title="Wallet and accounts" body="Sui wallet, statements, top-up" onClick={() => go("/app/accounts")} />
      </BottomSheet>

      <TopUpDialog open={dialog === "topup"} onClose={() => setDialog(null)} />
      <AddBudgetDialog open={dialog === "budget"} onClose={() => setDialog(null)} />
      <AddGoalDialog open={dialog === "goal"} onClose={() => setDialog(null)} />
    </>
  );
}

import {
  ArrowLeftRight,
  ChartPie,
  Highlighter,
  LayoutGrid,
  MessageSquareText,
  Repeat,
  ShieldCheck,
  ShieldHalf,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ShellStats } from "@/lib/app-data";
import { TRANSACTIONS_LOADED } from "@/lib/backend";

/** A count badge, hidden at zero so an empty list doesn't look like a broken number. */
const count = (n: number): NavBadge | undefined =>
  n > 0 ? { text: n >= TRANSACTIONS_LOADED ? `${TRANSACTIONS_LOADED}+` : String(n), tone: "count" } : undefined;

export type NavBadge = { text: string; tone: "count" | "caution" };
export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: NavBadge };

export function navGroups(stats: ShellStats): { label: string; items: NavItem[] }[] {
  return [
    {
      label: "Money",
      items: [
        { href: "/app", label: "Overview", icon: LayoutGrid },
        {
          href: "/app/transactions",
          label: "Transactions",
          icon: ArrowLeftRight,
          badge: count(stats.transactions),
        },
        {
          href: "/app/budgets",
          label: "Budgets",
          icon: ChartPie,
          badge: stats.budgetsOver ? { text: `${stats.budgetsOver} over`, tone: "caution" } : undefined,
        },
        { href: "/app/goals", label: "Goals", icon: Target },
        {
          href: "/app/recurring",
          label: "Recurring",
          icon: Repeat,
          badge: stats.dueSoon ? { text: `${stats.dueSoon} due`, tone: "caution" } : undefined,
        },
      ],
    },
    {
      label: "Assistant",
      items: [
        { href: "/app/ask", label: "Ask Sovra", icon: MessageSquareText },
        { href: "/app/audit", label: "Private audit", icon: ShieldCheck },
        { href: "/app/guard", label: "Spending guard", icon: ShieldHalf },
        {
          href: "/app/memory",
          label: "Memory",
          icon: Highlighter,
          badge: count(stats.memories),
        },
      ],
    },
    {
      label: "Sources",
      items: [{ href: "/app/accounts", label: "Accounts", icon: Wallet }],
    },
  ];
}

export function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(href);
}

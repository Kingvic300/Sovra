import {
  ArrowLeftRight,
  ChartPie,
  Highlighter,
  LayoutGrid,
  MessageSquareText,
  Repeat,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ShellStats } from "@/lib/app-data";

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
          badge: { text: String(stats.transactions), tone: "count" },
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
        {
          href: "/app/memory",
          label: "Memory",
          icon: Highlighter,
          badge: { text: String(stats.memories), tone: "count" },
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

import { useMemo, useState } from "react";
import { Search, Upload } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { useAppData } from "@/lib/app-data";
import { ACCOUNTS, CATEGORIES, type CategoryId, type Transaction } from "@/lib/demo-data";
import { shortDate, signedMoney } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import { Chip } from "@/components/ui/form-controls";

type Pending = { txId: string; merchant: string; category: CategoryId };

export function TransactionsTable({ initial }: { initial: Transaction[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryId | "all">("all");
  const [pending, setPending] = useState<Pending | null>(null);
  const toast = useToast();
  const { addMemory } = useAppData();

  const accountName = (id: string) => ACCOUNTS.find((a) => a.id === id)?.name ?? "";

  const visible = useMemo(
    () =>
      rows.filter(
        (t) =>
          (filter === "all" || t.category === filter) &&
          t.merchant.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [rows, filter, query],
  );

  const usedCategories = useMemo(
    () => (Object.keys(CATEGORIES) as CategoryId[]).filter((c) => rows.some((t) => t.category === c)),
    [rows],
  );

  function changeCategory(tx: Transaction, category: CategoryId) {
    setRows((prev) => prev.map((t) => (t.id === tx.id ? { ...t, category, learnedFrom: undefined } : t)));
    setPending({ txId: tx.id, merchant: tx.merchant, category });
  }

  function rememberForMerchant() {
    if (!pending) return;
    setRows((prev) =>
      prev.map((t) =>
        t.merchant === pending.merchant ? { ...t, category: pending.category, learnedFrom: "new" } : t,
      ),
    );
    const category = CATEGORIES[pending.category].toLowerCase();
    addMemory({
      kind: "correction",
      text: `${pending.merchant} transactions are ${category}.`,
      highlight: category,
      source: "You edited a transaction",
    });
    toast.success({
      title: "Saved to memory",
      description: `${pending.merchant} is always ${CATEGORIES[pending.category].toLowerCase()} from now on.`,
    });
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search transactions</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchants"
            className="h-10 w-full rounded-lg border border-field bg-card pr-3 pl-9 placeholder:text-muted focus:border-cobalt focus:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/20 pointer-coarse:h-11"
          />
        </label>
        <div
          className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0"
          role="group"
          aria-label="Filter by category"
        >
          {(["all", ...usedCategories] as const).map((c) => (
            <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
              {c === "all" ? "All" : CATEGORIES[c]}
            </Chip>
          ))}
        </div>
        <Link to="/app/accounts" className={`${buttonClass("secondary", "sm")} ml-auto`}>
          <Upload className="size-4" aria-hidden />
          Import CSV
        </Link>
      </div>

      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-highlighter bg-[#fffbe6] px-4 py-3">
          <p>
            Always file <span className="font-semibold">{pending.merchant}</span> under{" "}
            <mark className="remembered">{CATEGORIES[pending.category].toLowerCase()}</mark>?
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={rememberForMerchant}>
              Remember this
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPending(null)}>
              Just this once
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-card bg-card shadow-card">
        {/* Phones: one card row per transaction so the amount is never cut off. */}
        <ul className="divide-y divide-line md:hidden">
          {visible.map((tx) => (
            <li key={tx.id} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-semibold">{tx.merchant}</p>
                <p className={`shrink-0 font-semibold tabular-nums ${tx.amount > 0 ? "text-gain" : ""}`}>{signedMoney(tx.amount)}</p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[13px] text-muted">
                <span>
                  {shortDate(tx.date)} <span aria-hidden>/</span> {accountName(tx.accountId)}
                </span>
                {tx.learnedFrom && <span className="text-cobalt">learned</span>}
              </div>
              <label className="mt-2 block">
                <span className="sr-only">Category for {tx.merchant}</span>
                <select
                  value={tx.category}
                  onChange={(e) => changeCategory(tx, e.target.value as CategoryId)}
                  className="h-11 w-full rounded-lg border border-field bg-card px-3 text-[15px] focus:border-cobalt focus:outline-none"
                >
                  {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIES[c]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
        <table className="hidden w-full border-collapse text-left md:table">
          <thead className="border-b border-line text-[13px] text-muted">
            <tr>
              <th className="py-3 pr-3 pl-5 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Merchant</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Account</th>
              <th className="px-3 py-3 font-medium">Category</th>
              <th className="py-3 pr-5 pl-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((tx) => (
              <tr key={tx.id} className="border-t border-line first:border-t-0">
                <td className="py-3 pr-3 pl-5 align-top text-[13px] whitespace-nowrap text-muted tabular-nums">
                  {shortDate(tx.date)}
                </td>
                <td className="px-3 py-3 align-top">
                  <p className="font-medium">{tx.merchant}</p>
                  {tx.learnedFrom && <p className="text-[12px] text-cobalt">learned from your edit</p>}
                </td>
                <td className="hidden px-3 py-3 align-top text-muted md:table-cell">{accountName(tx.accountId)}</td>
                <td className="px-3 py-2 align-top">
                  <label>
                    <span className="sr-only">Category for {tx.merchant}</span>
                    <select
                      value={tx.category}
                      onChange={(e) => changeCategory(tx, e.target.value as CategoryId)}
                      className="h-8 max-w-[170px] rounded-md border border-transparent bg-transparent px-1.5 text-[14px] hover:border-line focus:border-line"
                    >
                      {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORIES[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                </td>
                <td
                  className={`py-3 pr-5 pl-3 text-right align-top font-semibold whitespace-nowrap tabular-nums ${
                    tx.amount > 0 ? "text-gain" : ""
                  }`}
                >
                  {signedMoney(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-5 py-10 text-center text-muted">No transactions match. Clear the search or pick another category.</p>
        )}
      </div>
    </div>
  );
}

import { useId, useMemo, useState } from "react";
import { Search, Upload, X } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { ApiError } from "@/lib/api";
import { currencyOf, useAppData } from "@/lib/app-data";
import { CATEGORIES, type CategoryId, type Transaction } from "@/lib/demo-data";
import { money, shortDate, signedMoney } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

type Pending = { txId: string; merchant: string; category: CategoryId };

/** Category filter with a live count. */
function FilterPill({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border pr-2 pl-3.5 text-[14px] font-medium whitespace-nowrap transition-colors pointer-coarse:h-10 ${
        active
          ? "border-cobalt bg-cobalt text-white"
          : `border-field/70 bg-card hover:border-cobalt ${count === 0 ? "text-muted" : "text-ink"}`
      }`}
    >
      {children}
      <span
        className={`min-w-5 rounded-full px-1.5 text-center text-[12px] leading-5 font-semibold tabular-nums ${
          active ? "bg-white/20 text-white" : "bg-porcelain text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function TransactionsTable() {
  const { data, recategorize, rememberCategory } = useAppData();
  const rows = data.transactions;
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryId | "all">("all");
  const [pending, setPending] = useState<Pending | null>(null);
  const toast = useToast();
  const searchId = useId();

  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";
  const currencyFor = (id: string) => currencyOf(data, id);

  const q = query.trim().toLowerCase();
  const matching = useMemo(() => rows.filter((t) => t.merchant.toLowerCase().includes(q)), [rows, q]);
  const visible = useMemo(() => matching.filter((t) => filter === "all" || t.category === filter), [matching, filter]);
  const countFor = (c: CategoryId | "all") => (c === "all" ? matching.length : matching.filter((t) => t.category === c).length);
  const spent = visible.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
  const received = visible.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
  // Totals only add up when every shown transaction is in one currency.
  const currencies = new Set(visible.map((t) => currencyFor(t.accountId)));
  const totalsCurrency = currencies.size === 1 ? [...currencies][0] : null;
  const filtered = filter !== "all" || q !== "";

  function clearFilters() {
    setQuery("");
    setFilter("all");
  }

  const usedCategories = useMemo(
    () => (Object.keys(CATEGORIES) as CategoryId[]).filter((c) => rows.some((t) => t.category === c)),
    [rows],
  );

  function changeCategory(tx: Transaction, category: CategoryId) {
    recategorize(tx.id, category);
    setPending({ txId: tx.id, merchant: tx.merchant, category });
  }

  async function rememberForMerchant() {
    if (!pending) return;
    const label = CATEGORIES[pending.category].toLowerCase();
    setSaving(true);
    try {
      const outcome = await rememberCategory(pending.txId, pending.merchant, pending.category);
      if (outcome === "saved") {
        toast.success({ title: "Saved to memory", description: `${pending.merchant} is always ${label} from now on.` });
      } else {
        toast.info({
          title: `${pending.merchant} is always ${label} now`,
          description: "The rule is saved, but Walrus Memory didn't take the note. Sovra still applies it to new imports.",
        });
      }
      setPending(null);
    } catch (e) {
      toast.error({ title: "Couldn't save the rule", description: e instanceof ApiError ? e.message : "Try again in a moment." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-80">
            <label htmlFor={searchId} className="sr-only">
              Search transactions
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id={searchId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search merchants"
              enterKeyHint="search"
              className="h-10 w-full rounded-lg border border-field bg-card pr-10 pl-9 placeholder:text-muted focus:border-cobalt focus:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/20 pointer-coarse:h-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-porcelain hover:text-ink pointer-coarse:size-9"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <Link to="/app/accounts" className={`${buttonClass("secondary")} ml-auto shrink-0 px-3 pointer-coarse:min-w-11 sm:px-4`}>
            <Upload className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Import statement</span>
          </Link>
        </div>

        {/* Wraps on every width: the page never scrolls sideways on phones. */}
        <div
          className="flex flex-wrap gap-2 py-0.5"
          role="group"
          aria-label="Filter by category"
        >
          {(["all", ...usedCategories] as const).map((c) => (
            <FilterPill key={c} active={filter === c} count={countFor(c)} onClick={() => setFilter(c)}>
              {c === "all" ? "All" : CATEGORIES[c]}
            </FilterPill>
          ))}
        </div>

        <div className="flex min-h-6 items-center justify-between gap-3 text-[13px] text-muted">
          <p aria-live="polite">
            <span className="font-semibold text-ink">{visible.length}</span> {visible.length === 1 ? "transaction" : "transactions"}
            {totalsCurrency && (
              <>
                <span aria-hidden> · </span>
                <span className="tabular-nums">{money(spent, { currency: totalsCurrency })} out</span>
                {received > 0 && (
                  <>
                    <span aria-hidden> · </span>
                    <span className="text-gain tabular-nums">{money(received, { currency: totalsCurrency })} in</span>
                  </>
                )}
              </>
            )}
          </p>
          {filtered && (
            <button type="button" onClick={clearFilters} className="-my-2 py-2 font-semibold text-cobalt hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-highlighter bg-[#fffbe6] px-4 py-3">
          <p>
            Always file <span className="font-semibold">{pending.merchant}</span> under{" "}
            <mark className="remembered">{CATEGORIES[pending.category].toLowerCase()}</mark>?
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={rememberForMerchant} disabled={saving}>
              {saving ? "Saving" : "Remember this"}
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
                <p className={`shrink-0 font-semibold tabular-nums ${tx.amount > 0 ? "text-gain" : ""}`}>{signedMoney(tx.amount, currencyFor(tx.accountId))}</p>
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
                  {signedMoney(tx.amount, currencyFor(tx.accountId))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="px-5 py-10 text-center">
            {rows.length === 0 ? (
              <>
                <p className="text-muted">No transactions yet.</p>
                <Link to="/app/accounts" className="mt-2 inline-block font-semibold text-cobalt hover:underline">
                  Import a statement
                </Link>
              </>
            ) : (
              <>
                <p className="text-muted">No transactions match.</p>
                <button type="button" onClick={clearFilters} className="mt-2 font-semibold text-cobalt hover:underline">
                  Clear filters
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

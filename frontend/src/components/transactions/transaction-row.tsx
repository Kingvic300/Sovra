import { CATEGORIES, type Transaction } from "@/lib/demo-data";
import { shortDate, signedMoney } from "@/lib/format";

export function TransactionRow({ tx, accountName }: { tx: Transaction; accountName?: string }) {
  return (
    <li className="grid grid-cols-[56px_1fr_auto] items-start gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
      <span className="pt-0.5 text-[13px] tabular-nums text-muted">{shortDate(tx.date)}</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{tx.merchant}</p>
        <p className="text-[13px] text-muted">
          {CATEGORIES[tx.category]}
          {tx.learnedFrom && <span className="ml-2 text-cobalt">learned from your edit</span>}
          {accountName && <span className="ml-2">{accountName}</span>}
        </p>
      </div>
      <span className={`font-semibold tabular-nums ${tx.amount > 0 ? "text-gain" : ""}`}>{signedMoney(tx.amount)}</span>
    </li>
  );
}

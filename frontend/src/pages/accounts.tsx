import { FileSpreadsheet, Wallet } from "lucide-react";
import { CsvDrop } from "@/components/accounts/csv-drop";
import { RefreshBalanceButton } from "@/components/accounts/refresh-balance-button";
import { TopUpButton } from "@/components/topup/top-up-button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { useAppData, walletAccount } from "@/lib/app-data";
import { money, shortAddress, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export default function AccountsPage() {
  useTitle("Accounts");
  const { data } = useAppData();
  const wallet = walletAccount(data);
  const csvAccounts = data.accounts.filter((a) => a.source === "csv");
  const month = data.today.slice(0, 7);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description="Import bank statements (CSV, Excel or PDF) and connect a Sui wallet. Sovra never moves money. It only reads."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {wallet && (
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Wallet className="size-4 text-cobalt" aria-hidden />
                {wallet.name}
              </span>
            }
            action={
              wallet.status === "live" && (
                <span className="rounded-full bg-cobalt-soft px-2.5 py-0.5 text-[12px] font-semibold text-cobalt">
                  Live via Tatum
                </span>
              )
            }
          >
            {wallet.balance === null ? (
              <p className="text-[17px] text-muted">{wallet.detail}.</p>
            ) : (
              <p className="text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                {money(wallet.balance)} <span className="text-lg font-bold text-muted">USDC</span>
              </p>
            )}
            <dl className="mt-5 grid grid-cols-[120px_1fr] gap-y-2 text-[14px]">
              <dt className="text-muted">Address</dt>
              <dd className="font-medium tabular-nums" title={wallet.address}>
                {shortAddress(wallet.address!)}
              </dd>
              <dt className="text-muted">Network</dt>
              <dd className="font-medium">Sui mainnet</dd>
              <dt className="text-muted">Read through</dt>
              <dd className="font-medium">Tatum Sui RPC gateway</dd>
              <dt className="text-muted">Transactions</dt>
              <dd className="font-medium">
                {data.transactions.filter((t) => t.accountId === wallet.id && t.date.startsWith(month)).length} this month,
                matched by sender and amount
              </dd>
            </dl>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <TopUpButton />
              <RefreshBalanceButton />
              {wallet.syncedAt && <span className="text-[13px] text-muted">Last read {shortDate(wallet.syncedAt)}</span>}
            </div>
          </Panel>
        )}

        <Panel title="Bank statements">
          <ul className="divide-y divide-line">
            {csvAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-porcelain text-muted">
                    <FileSpreadsheet className="size-[18px]" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    {a.syncedAt && <p className="text-[13px] text-muted">Imported {shortDate(a.syncedAt)}</p>}
                  </div>
                </div>
                <p className="font-semibold tabular-nums">
                  {a.balance === null ? <span className="font-normal text-muted">Balance not known</span> : money(a.balance)}
                </p>
              </li>
            ))}
            {csvAccounts.length === 0 && <li className="pb-1 text-muted">No statements imported yet.</li>}
          </ul>
          <div className="mt-4">
            <CsvDrop />
          </div>
        </Panel>
      </div>
    </div>
  );
}

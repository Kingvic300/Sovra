import { TransactionsTable } from "@/components/transactions/transactions-table";
import { PageHeader } from "@/components/ui/page-header";
import { TRANSACTIONS } from "@/lib/demo-data";
import { useTitle } from "@/lib/use-title";

export default function TransactionsPage() {
  useTitle("Transactions");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="Change a category and Sovra asks whether to remember it for that merchant. Remembered rules apply to every future import."
      />
      <TransactionsTable initial={TRANSACTIONS} />
    </div>
  );
}

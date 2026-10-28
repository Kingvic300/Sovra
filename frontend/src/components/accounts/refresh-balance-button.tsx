import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

/** Re-reads the Sui wallet's USDC balance through the backend (Tatum). */
export function RefreshBalanceButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const { amount, usdc } = await api<{ amount?: number; usdc: string }>("/wallet/balance");
      toast.success({ title: "Balance updated", description: `${money(amount ?? Number(usdc))} USDC on Sui.` });
    } catch (e) {
      toast.error({
        title: "Couldn't refresh the balance",
        description: e instanceof ApiError ? e.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={refresh} disabled={busy}>
      <RefreshCw className={`size-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
      {busy ? "Refreshing" : "Refresh balance"}
    </Button>
  );
}

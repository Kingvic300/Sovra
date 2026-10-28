import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Building2, Check, Copy, Loader2, TriangleAlert, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { DEMO_WALLET_ADDRESS } from "@/lib/demo-data";
import { money } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

type Step = "method" | "send" | "waiting" | "arrived";
type Method = "exchange" | "wallet";

const POLL_MS = 15_000;

/** Reads the USDC balance from the backend (Tatum Sui RPC). Null if the backend isn't reachable. */
async function fetchUsdcBalance(): Promise<number | null> {
  try {
    const res = await fetch("/api/wallet/balance", { credentials: "include" });
    if (!res.ok) return null;
    // `amount` is a number; `usdc` is the same value as an exact decimal string (older backends only send that).
    const body = (await res.json()) as { amount?: number; usdc?: string };
    const value = typeof body.amount === "number" ? body.amount : Number(body.usdc);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function TopUpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>("exchange");
  const [copied, setCopied] = useState(false);
  const [received, setReceived] = useState(0);
  const toast = useToast();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // While waiting, watch the balance and stop when it goes up.
  useEffect(() => {
    if (step !== "waiting") return;
    let baseline: number | null = null;
    let stopped = false;
    const check = async () => {
      const now = await fetchUsdcBalance();
      if (stopped || now === null) return;
      if (baseline === null) baseline = now;
      else if (now > baseline) {
        setReceived(now - baseline);
        setStep("arrived");
        toast.success({ title: `${money(now - baseline)} USDC arrived`, description: "Your balance is up to date." });
      }
    };
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step, toast]);

  function close() {
    onClose();
    setTimeout(() => setStep("method"), 200);
  }

  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  }

  const address = session?.address ?? DEMO_WALLET_ADDRESS;

  return (
    <dialog
      ref={dialog}
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-card bg-card p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-2">
          {step === "send" && (
            <button type="button" onClick={() => setStep("method")} aria-label="Back" className="-ml-2 grid size-9 place-items-center rounded-md text-muted hover:bg-porcelain hover:text-ink pointer-coarse:size-11">
              <ArrowLeft className="size-4" />
            </button>
          )}
          <h2 className="text-[17px] font-semibold">Top up your Sui wallet</h2>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="grid size-9 place-items-center rounded-md text-muted hover:bg-porcelain hover:text-ink pointer-coarse:size-11">
          <X className="size-4" />
        </button>
      </div>

      <div className="px-6 py-5">
        {step === "method" && (
          <>
            <p className="text-muted">
              Sovra never holds your money. You send USDC to your own Sui address, and Sovra sees it arrive through Tatum.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {(
                [
                  { id: "exchange", icon: Building2, title: "From an exchange", body: "Withdraw USDC and choose Sui as the network." },
                  { id: "wallet", icon: Wallet, title: "From another Sui wallet", body: "Send USDC from Slush or any Sui wallet." },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMethod(m.id);
                    setStep("send");
                  }}
                  className="flex items-start gap-3.5 rounded-xl border border-line p-4 text-left transition-colors hover:border-cobalt/50 hover:bg-cobalt-soft/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
                    <m.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold">{m.title}</span>
                    <span className="block text-[14px] text-muted">{m.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "send" && (
          <>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="rounded-xl border border-line bg-white p-3">
                <QRCodeSVG value={address} size={148} fgColor="#0F1B33" level="M" />
              </div>
              <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
                <dt className="text-muted">Token</dt>
                <dd className="font-semibold">USDC</dd>
                <dt className="text-muted">Network</dt>
                <dd className="font-semibold">Sui</dd>
                <dt className="text-muted">Arrives in</dt>
                <dd className="font-semibold">Under a minute</dd>
              </dl>
            </div>

            <p className="mt-5 text-[13px] text-muted">
              {session ? "Your Sui address" : "Demo wallet address. Sign in with Google to get your own."}
            </p>
            <button
              type="button"
              onClick={copy}
              className="mt-1 flex w-full items-center justify-between gap-3 rounded-lg bg-porcelain px-3.5 py-3 text-left"
            >
              <span className="min-w-0 font-mono text-[13px] break-all">{address}</span>
              {copied ? <Check className="size-4 shrink-0 text-gain" aria-label="Copied" /> : <Copy className="size-4 shrink-0 text-muted" aria-label="Copy address" />}
            </button>

            <ol className="mt-5 flex list-decimal flex-col gap-1.5 pl-5 text-[14px]">
              {method === "exchange" ? (
                <>
                  <li>In your exchange, open Withdraw and pick USDC.</li>
                  <li>Choose <span className="font-semibold">Sui</span> as the network.</li>
                  <li>Paste the address above and confirm.</li>
                </>
              ) : (
                <>
                  <li>In your wallet, choose Send and pick USDC.</li>
                  <li>Paste the address above or scan the code.</li>
                  <li>Confirm the transfer.</li>
                </>
              )}
            </ol>

            <p className="mt-5 flex gap-2.5 rounded-lg bg-caution-soft px-3.5 py-3 text-[13px] text-caution">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Only send USDC on the Sui network. Other tokens or networks can't be recovered.
            </p>

            <Button className="mt-5 w-full" onClick={() => setStep("waiting")}>
              I've sent it
            </Button>
          </>
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center py-6 text-center">
            <Loader2 className="size-8 animate-spin text-cobalt motion-reduce:animate-none" aria-hidden />
            <p className="mt-4 font-semibold">Watching for your deposit</p>
            <p className="mt-1 max-w-[40ch] text-[14px] text-muted">
              Sovra checks your address through Tatum every 15 seconds. You can close this; the balance updates when it lands.
            </p>
            <Button variant="secondary" className="mt-5" onClick={close}>
              Close
            </Button>
          </div>
        )}

        {step === "arrived" && (
          <div role="status" className="flex flex-col items-center py-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-gain-soft text-gain">
              <Check className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold">{money(received)} USDC arrived</p>
            <p className="mt-1 text-[14px] text-muted">It's in your balance and budgets now.</p>
            <Button className="mt-5" onClick={close}>
              Done
            </Button>
          </div>
        )}
      </div>
    </dialog>
  );
}

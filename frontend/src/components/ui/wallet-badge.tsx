import { X } from "lucide-react";

/** A wallet's logo with a red cross, for toasts about a wallet that didn't connect or sign. */
export function WalletFailedBadge({ icon }: { icon: string }) {
  return (
    <span className="relative size-10 shrink-0" aria-hidden>
      <img src={icon} alt="" className="size-10 rounded-xl ring-1 ring-line" />
      <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-over ring-2 ring-card">
        <X className="size-3 text-white" strokeWidth={3} />
      </span>
    </span>
  );
}

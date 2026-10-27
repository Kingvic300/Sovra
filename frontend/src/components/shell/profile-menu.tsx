import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check, ChevronDown, Copy, FileText, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { shortAddress } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

export function ProfileMenu() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session) {
    return (
      <Link
        to="/signin"
        className="flex h-9 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-white transition-colors hover:bg-cobalt"
      >
        Sign in
      </Link>
    );
  }
  const name = profile?.name || session.name || "You";
  const detail = session.method === "demo" ? "Demo account" : session.email || "Signed in with Google";

  async function copyAddress() {
    await navigator.clipboard.writeText(session!.address);
    setCopied(true);
    toast.success("Sui address copied");
    setTimeout(() => setCopied(false), 1500);
  }

  async function logOut() {
    setOpen(false);
    try {
      await signOut();
      toast.info("You're logged out");
      navigate("/");
    } catch {
      toast.error({ title: "Couldn't log out", description: "Try again, or close this tab to end the session." });
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account menu for ${name}`}
        className="flex min-h-11 items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-card md:pr-2"
      >
        <span className="grid size-9 place-items-center rounded-full bg-cobalt text-[14px] font-bold text-white">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[14px] font-semibold">{name}</span>
          <span className="block text-[12px] text-muted">{detail}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted md:block" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-card bg-card shadow-pop ring-1 ring-line">
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold">{name}</p>
            <p className="text-[13px] text-muted">{detail}</p>
            <button
              type="button"
              onClick={copyAddress}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg bg-porcelain px-3 py-2 text-left text-[13px]"
            >
              <span>
                <span className="block text-muted">Your Sui address</span>
                <span className="font-semibold tabular-nums">{shortAddress(session.address)}</span>
              </span>
              {copied ? (
                <Check className="size-4 text-gain" aria-label="Copied" />
              ) : (
                <Copy className="size-4 text-muted" aria-label="Copy address" />
              )}
            </button>
          </div>
          <nav className="flex flex-col py-1.5 text-[14px]">
            <Link to="/security" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 hover:bg-porcelain">
              <ShieldCheck className="size-4 text-muted" aria-hidden /> How Sovra keeps you safe
            </Link>
            <Link to="/terms" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 hover:bg-porcelain">
              <FileText className="size-4 text-muted" aria-hidden /> Terms
            </Link>
            <Link to="/privacy" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 hover:bg-porcelain">
              <FileText className="size-4 text-muted" aria-hidden /> Privacy
            </Link>
          </nav>
          <button
            type="button"
            onClick={logOut}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-[14px] font-semibold text-over hover:bg-over-soft"
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

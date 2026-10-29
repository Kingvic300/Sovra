import { useState } from "react";
import { useWallets, type UiWallet } from "@mysten/dapp-kit-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Highlighter, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { EmailForm } from "@/components/auth/email-form";
import { Logo, Wordmark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Remembered } from "@/components/ui/remembered";
import { WalletFailedBadge } from "@/components/ui/wallet-badge";
import { useAuth } from "@/lib/auth-context";
import { ROUTE_GUARDS_ENABLED } from "@/lib/config";
import { useToast } from "@/lib/toast-context";
import { useTitle } from "@/lib/use-title";

const FACTS = [
  { icon: KeyRound, title: "Your wallet, your keys", body: "Sign in with any Sui wallet. Sovra asks for one signature to prove the address is yours." },
  { icon: ShieldCheck, title: "Read only", body: "Sovra reads balances and statements. It can never move your money." },
  { icon: Highlighter, title: "Memory you own", body: "Goals and decisions are stored encrypted on Walrus. Forget any of them at any time." },
];

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const wallets = useWallets();
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  useTitle(mode === "signin" ? "Sign in" : "Create your account");

  const from = (location.state as { from?: string } | null)?.from;
  if (ROUTE_GUARDS_ENABLED && auth.status === "signed-in") {
    return <Navigate to={auth.profile?.onboarded ? from || "/app" : "/onboarding"} replace />;
  }

  async function connect(wallet: UiWallet) {
    setBusy(wallet.name);
    try {
      await auth.signInWithWallet(wallet);
      // The guard on /app sends new users to onboarding.
      navigate("/app", { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message.toLowerCase() : "";
      const declined = message.includes("reject") || message.includes("closed") || message.includes("cancel");
      toast.error({
        title: `${wallet.name} didn't connect`,
        description: declined
          ? `Approve the request in ${wallet.name} to continue.`
          : "Try again, or explore with the demo account.",
        media: <WalletFailedBadge icon={wallet.icon} />,
        action: { label: "Try again", onClick: () => void connect(wallet) },
      });
    } finally {
      setBusy(null);
    }
  }

  function demo() {
    setBusy("demo");
    auth.startDemo();
    navigate("/app", { replace: true });
  }

  const signin = mode === "signin";

  return (
    <div className={`grid min-h-dvh md:grid-cols-2 ${signin ? "xl:grid-cols-[1.15fr_1fr]" : "xl:grid-cols-[1fr_1.15fr]"}`}>
      {/* Sign-in puts the form on the right, sign-up on the left, so the two pages mirror each other. */}
      <div className={`flex flex-col px-6 py-6 sm:px-10 ${signin ? "md:order-2" : ""}`}>
        <Link to="/" className="self-center text-[24px] md:self-start" aria-label="Sovra home">
          <Wordmark />
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.025em]">
              {signin ? "Welcome back" : "Create your Sovra account"}
            </h1>
            <p className="mt-2 text-[16px] text-muted">
              {signin
                ? "Use your email or your Sui wallet. Sovra picks up exactly where you left off."
                : "Sign up with email, or connect a Sui wallet to include USDC. Slush works in the browser with nothing to install."}
            </p>

            <div className="mt-8 rounded-card bg-card p-5 shadow-card">
              <EmailForm mode={mode} disabled={busy !== null} onBusy={(b) => setBusy(b ? "email" : null)} />

              <div className="my-5 flex items-center gap-3 text-[13px] text-muted">
                <span className="h-px flex-1 bg-line" />
                or use a Sui wallet
                <span className="h-px flex-1 bg-line" />
              </div>

              <ul className="flex flex-col gap-2">
                {wallets.map((w) => (
                  <li key={w.name}>
                    <button
                      type="button"
                      onClick={() => void connect(w)}
                      disabled={busy !== null}
                      className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-line bg-card font-semibold transition-colors hover:border-ink/30 hover:bg-porcelain disabled:opacity-60"
                    >
                      {busy === w.name ? (
                        <Loader2 className="size-5 animate-spin" aria-hidden />
                      ) : (
                        <img src={w.icon} alt="" className="size-5 rounded" />
                      )}
                      {busy === w.name ? `Waiting for ${w.name}` : `Continue with ${w.name}`}
                    </button>
                  </li>
                ))}
              </ul>
              {wallets.length === 0 && (
                <p className="text-[14px] text-muted">
                  No Sui wallet found. Install{" "}
                  <a href="https://slush.app" target="_blank" rel="noreferrer" className="font-semibold text-cobalt hover:underline">
                    Slush
                  </a>{" "}
                  and reload this page.
                </p>
              )}
            </div>

            <div className="my-6 flex items-center gap-3 text-[13px] text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <Button variant="secondary" className="h-12 w-full" onClick={demo} disabled={busy !== null}>
              Explore with a demo account
            </Button>
            <p className="mt-2 text-center text-[13px] text-muted">Sample data in a private demo account.</p>

            <p className="mt-8 text-center text-[14px] text-muted">
              {signin ? "New to Sovra? " : "Already have an account? "}
              <Link to={signin ? "/signup" : "/signin"} className="font-semibold text-cobalt hover:underline">
                {signin ? "Create an account" : "Sign in"}
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-[13px] text-muted md:text-left">
          By continuing you agree to the{" "}
          <Link to="/terms" className="font-semibold text-ink hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="font-semibold text-ink hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <aside
        className={`relative hidden overflow-hidden bg-ink px-10 py-12 text-white md:flex md:flex-col lg:px-14 ${signin ? "md:order-1" : ""}`}
      >
        {/* Oversized brand mark as the panel's single decorative element. */}
        <Logo
          variant="white"
          className={`pointer-events-none absolute -bottom-24 size-[520px] opacity-[0.06] ${signin ? "-left-24" : "-right-24"}`}
        />

        <h2 className="relative max-w-[16ch] text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] lg:text-[44px]">
          Money help that remembers you.
        </h2>
        <p className="relative mt-3 max-w-[42ch] text-white/70">
          Tell Sovra once. It keeps your goals, limits and decisions in a vault you own, and uses them every time you ask.
        </p>

        <div className="relative mt-10 max-w-[480px]">
          <div className="rounded-card bg-white p-5 text-ink shadow-pop">
            <p className="flex items-center justify-between text-[13px] text-muted">
              Sovra remembers
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-gain" />
                Saved to Walrus
              </span>
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-[15px]">
              <li>
                <Remembered text="You're saving for a laptop, $1,200 by January." highlight="laptop, $1,200 by January" />
              </li>
              <li>
                <Remembered text="Keep entertainment under $100 a month." highlight="under $100 a month" />
              </li>
            </ul>
          </div>
          <div className="relative -mt-3 ml-8 rounded-card bg-white p-5 text-ink shadow-pop ring-1 ring-line lg:ml-14">
            <div className="flex gap-3">
              <Logo variant="tile" className="size-8 shrink-0" />
              <p className="text-[15px] leading-relaxed">
                Spotify and Netflix renew Friday. That's $11 over your limit. Pause Netflix this month?
              </p>
            </div>
          </div>
        </div>

        <ul className="relative mt-auto grid gap-5 pt-12 lg:grid-cols-3">
          {FACTS.map((f) => (
            <li key={f.title}>
              <f.icon className="size-5 text-signal" aria-hidden />
              <p className="mt-2 font-semibold">{f.title}</p>
              <p className="text-[14px] text-white/65">{f.body}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

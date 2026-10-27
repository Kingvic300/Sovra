import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Highlighter, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Logo, Wordmark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Remembered } from "@/components/ui/remembered";
import { useAuth } from "@/lib/auth-context";
import { ROUTE_GUARDS_ENABLED } from "@/lib/config";
import { useTitle } from "@/lib/use-title";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  );
}

const FACTS = [
  { icon: KeyRound, title: "No seed phrase", body: "zkLogin turns your Google sign-in into a Sui address. Nothing to write down or lose." },
  { icon: ShieldCheck, title: "Read only", body: "Sovra reads balances and statements. It can never move your money." },
  { icon: Highlighter, title: "Memory you own", body: "Goals and decisions are stored encrypted on Walrus. Forget any of them at any time." },
];

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState<"google" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTitle(mode === "signin" ? "Sign in" : "Create your account");

  const from = (location.state as { from?: string } | null)?.from;
  if (ROUTE_GUARDS_ENABLED && auth.status === "signed-in") {
    return <Navigate to={auth.profile?.onboarded ? from || "/app" : "/onboarding"} replace />;
  }

  async function google() {
    setError(null);
    setBusy("google");
    try {
      await auth.signInWithGoogle();
      // The guard on /app sends new users to onboarding.
      navigate("/app", { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        message === "not_configured"
          ? "Google sign-in isn't set up on this deployment yet. Use the demo account to look around."
          : message.toLowerCase().includes("closed")
            ? "The Google window was closed before sign-in finished. Try again."
            : "Google sign-in didn't complete. Try again, or use the demo account.",
      );
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
                ? "Sign in with Google. Sovra picks up exactly where you left off."
                : "One tap with Google. Sovra sets up a private Sui address for you, no seed phrase needed."}
            </p>

            <div className="mt-8 rounded-card bg-card p-5 shadow-card">
              <button
                type="button"
                onClick={google}
                disabled={busy !== null}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-line bg-card font-semibold transition-colors hover:border-ink/30 hover:bg-porcelain disabled:opacity-60"
              >
                {busy === "google" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleIcon />}
                {busy === "google" ? "Waiting for Google" : "Continue with Google"}
              </button>

              {error && (
                <p role="alert" className="mt-3 rounded-lg bg-over-soft px-3.5 py-2.5 text-[14px] text-over">
                  {error}
                </p>
              )}

              <ul className="mt-4 flex flex-col gap-2 text-[13px] text-muted">
                {FACTS.slice(0, 2).map((f) => (
                  <li key={f.title} className="flex items-center gap-2">
                    <f.icon className="size-4 text-cobalt" aria-hidden />
                    <span>
                      <span className="font-semibold text-ink">{f.title}.</span> {f.body.split(".")[0]}.
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="my-6 flex items-center gap-3 text-[13px] text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <Button variant="secondary" className="h-12 w-full" onClick={demo} disabled={busy !== null}>
              Explore with a demo account
            </Button>
            <p className="mt-2 text-center text-[13px] text-muted">Sample data, stored only in this browser.</p>

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

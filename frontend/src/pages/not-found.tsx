import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, Search } from "lucide-react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/marketing-layout";
import { buttonClass } from "@/components/ui/button-class";
import { useAuth } from "@/lib/auth-context";
import { useTitle } from "@/lib/use-title";

const SIGNED_IN_LINKS = [
  { to: "/app", label: "Overview", body: "Balance, budgets and what Sovra remembers" },
  { to: "/app/transactions", label: "Transactions", body: "Everything imported, with learned categories" },
  { to: "/app/ask", label: "Ask Sovra", body: "Questions about your money, in plain words" },
  { to: "/app/memory", label: "Memory", body: "Every goal, limit and decision Sovra keeps" },
];

const PUBLIC_LINKS = [
  { to: "/", label: "Home", body: "What Sovra is and why it remembers" },
  { to: "/how-it-works", label: "How it works", body: "From wallet sign-in to advice that fits" },
  { to: "/security", label: "Security", body: "What Sovra can see and never does" },
  { to: "/faq", label: "FAQ", body: "Including how money gets into your account" },
];

export default function NotFoundPage() {
  useTitle("Page not found");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status } = useAuth();
  const signedIn = status === "signed-in";
  const links = signedIn ? SIGNED_IN_LINKS : PUBLIC_LINKS;

  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />

      <main id="main" tabIndex={-1} className="flex-1 px-5 py-14 sm:px-8 lg:px-14 lg:py-20">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="font-semibold text-cobalt">Error 404</p>
            <h1 className="mt-3 max-w-[19ch] text-[44px] leading-[1] font-extrabold tracking-[-0.035em] sm:text-[60px]">
              Sovra has no memory of this page.
            </h1>
            <p className="mt-5 max-w-[50ch] text-[18px] leading-relaxed text-muted">
              The link may be old or mistyped. Nothing is wrong with your money or your memories; they're exactly where
              you left them.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={signedIn ? "/app" : "/"} className={`${buttonClass()} h-12 px-6 text-[15px]`}>
                {signedIn ? "Go to overview" : "Back to home"}
              </Link>
              <button type="button" onClick={() => navigate(-1)} className={`${buttonClass("secondary")} h-12 px-6 text-[15px]`}>
                <ArrowLeft className="size-4" aria-hidden />
                Go back
              </button>
            </div>
          </div>

          {/* Sovra searching its memory and coming up empty. */}
          <div className="relative" aria-hidden="true">
            <div className="relative mx-auto w-fit select-none lg:mx-0 lg:ml-auto">
              <span className="absolute top-[54%] left-[-4%] h-[26%] w-[108%] -translate-y-1/2 -rotate-3 rounded-md bg-highlighter" />
              <span className="relative block text-[150px] leading-none font-extrabold tracking-[-0.06em] text-cobalt sm:text-[220px] xl:text-[260px]">
                404
              </span>
            </div>
            <div className="relative mx-auto -mt-4 max-w-[440px] rounded-card bg-card p-5 shadow-pop ring-1 ring-line lg:mr-0 lg:ml-auto">
              <div className="flex items-center gap-2.5 rounded-lg bg-porcelain px-3.5 py-2.5 text-[14px]">
                <Search className="size-4 shrink-0 text-muted" />
                <span className="truncate font-mono text-ink">{pathname}</span>
              </div>
              <p className="mt-3 flex items-center justify-between text-[14px]">
                <span className="text-muted">Searched pages and memories</span>
                <span className="font-semibold text-over">0 results</span>
              </p>
            </div>
          </div>
        </div>

        <section className="mt-16 lg:mt-20" aria-labelledby="try-instead">
          <h2 id="try-instead" className="text-[15px] font-semibold text-muted">
            Try one of these instead
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {links.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="block h-full rounded-card bg-card p-5 shadow-card ring-1 ring-transparent transition-colors hover:ring-cobalt/40"
                >
                  <span className="block font-bold">{l.label}</span>
                  <span className="mt-1 block text-[14px] text-muted">{l.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

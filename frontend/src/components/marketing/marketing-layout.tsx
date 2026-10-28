import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/shell/logo";
import { SkipLink } from "@/components/shell/skip-link";
import { buttonClass } from "@/components/ui/button-class";
import { useAuth } from "@/lib/auth-context";
import { CONTACT_EMAIL } from "@/lib/legal";

const NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/security", label: "Security" },
  { to: "/faq", label: "FAQ" },
];

function AccountActions({ onNavigate }: { onNavigate?: () => void }) {
  const { status, signOut } = useAuth();
  const navigate = useNavigate();

  // Don't flash "Sign in" while a saved session is being restored.
  if (status === "loading") return null;
  if (status === "signed-in") {
    return (
      <>
        <button
          type="button"
          onClick={async () => {
            onNavigate?.();
            await signOut();
            navigate("/");
          }}
          className={buttonClass("quiet")}
        >
          Log out
        </button>
        <Link
          to="/app"
          onClick={onNavigate}
          className={buttonClass("primary")}
        >
          Open Sovra
        </Link>
      </>
    );
  }
  return (
    <>
      <Link
        to="/signin"
        onClick={onNavigate}
        className={buttonClass("quiet")}
      >
        Sign in
      </Link>
      <Link
        to="/signup"
        onClick={onNavigate}
        className={buttonClass("primary")}
      >
        Get started
      </Link>
    </>
  );
}

export function MarketingHeader() {
  const { status } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <>
      <SkipLink />
      <div className="bg-ink px-5 py-2 text-center text-[13px] text-white/75 sm:px-8">
        Early access. Memories are saved on Walrus mainnet and balances are read live through Tatum.{" "}
        <Link to="/how-it-works" className="font-semibold text-white underline-offset-2 hover:underline">
          See how it works
        </Link>
      </div>

      <header className="sticky top-0 z-30 px-3 pt-3 lg:px-9">
        <div className="relative grid h-16 grid-cols-[1fr_auto] items-center gap-4 rounded-2xl bg-card/90 pr-2 pl-5 shadow-card ring-1 ring-line/80 backdrop-blur md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-3">
            <Link to="/" onClick={close} className="text-[22px]" aria-label="Sovra home">
              <Wordmark />
            </Link>
            <span className="hidden rounded-full bg-cobalt-soft px-2.5 py-0.5 text-[12px] font-semibold text-cobalt sm:inline">
              Early access
            </span>
          </div>

          <nav aria-label="Site" className="hidden items-center gap-1 rounded-full bg-porcelain p-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-1.5 text-[15px] font-medium transition-colors ${
                    isActive ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-1">
            <div className="hidden items-center gap-1 sm:flex">
              <AccountActions />
            </div>
            {status === "signed-in" && (
              <Link to="/app" onClick={close} className={`${buttonClass("primary", "sm")} sm:hidden`}>
                Open Sovra
              </Link>
            )}
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="grid size-11 place-items-center rounded-full text-ink hover:bg-porcelain md:hidden"
            >
              {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>

          {menuOpen && (
            <div className="absolute inset-x-0 top-[calc(100%+8px)] rounded-2xl bg-card p-3 shadow-pop ring-1 ring-line md:hidden">
              <nav aria-label="Site" className="flex flex-col">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={close}
                    className={({ isActive }) =>
                      `rounded-xl px-4 py-3 text-[16px] font-medium ${isActive ? "bg-porcelain text-ink" : "text-muted"}`
                    }
                  >
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-2 flex items-center justify-end gap-1 border-t border-line pt-3 sm:hidden">
                <AccountActions onNavigate={close} />
              </div>
            </div>
          )}
        </div>
      </header>
    </>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-ink text-white">
      <div className="grid gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-14">
        <div>
          <Wordmark tone="white" className="text-[24px]" />
          <p className="mt-3 max-w-[36ch] text-white/65">
            A personal finance app that remembers your goals, limits and decisions, so every answer fits your life.
          </p>
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-white/50">Product</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {NAV.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="text-white/85 hover:text-white">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/signin" className="text-white/85 hover:text-white">
                Sign in
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-white/50">Legal</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link to="/terms" className="text-white/85 hover:text-white">
                Terms and conditions
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="text-white/85 hover:text-white">
                Privacy policy
              </Link>
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-white/85 hover:text-white">
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-white/50">Built on</h2>
          <ul className="mt-3 flex flex-col gap-2 text-white/85">
            <li>Sui zkLogin</li>
            <li>Walrus Memory</li>
            <li>Tatum</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-[13px] text-white/50 sm:px-8 lg:px-14">
        © 2026 Sovra. Early access. Sovra is not a bank and does not give financial advice.
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}

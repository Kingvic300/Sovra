import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  Check,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  FileText,
  Highlighter,
  LogOut,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { EmailSignInDialog } from "@/components/auth/email-sign-in-dialog";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { fieldClass } from "@/components/ui/field-class";
import { Field } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Remembered } from "@/components/ui/remembered";
import { ApiError } from "@/lib/api";
import { memoryCount, useAppData } from "@/lib/app-data";
import { currencyOptions } from "@/lib/currency";
import { useAuth, type Profile, type Session } from "@/lib/auth-context";
import { shortAddress } from "@/lib/format";
import { memoriesFromProfile, ordinal, paydayMemory } from "@/lib/onboarding";
import { useToast } from "@/lib/toast-context";
import { useTitle } from "@/lib/use-title";

const SOURCES = [
  { key: "sui", icon: Wallet, title: "USDC on Sui", body: "Read live through Tatum." },
  { key: "csv", icon: FileSpreadsheet, title: "Bank statements", body: "CSV, Excel or PDF statements you upload." },
] as const;

function methodLabel(session: Session) {
  if (session.method === "demo") return "Demo account";
  if (session.viaPassword) return session.method === "wallet" ? "Email and password (wallet account)" : "Email and password";
  return "Sui wallet";
}

function IdentityCard({ session, name }: { session: Session; name: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    await navigator.clipboard.writeText(session.address);
    setCopied(true);
    toast.success("Sui address copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section
      aria-label="Your account"
      className="flex flex-col gap-5 rounded-card bg-ink p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span
          className="grid size-16 shrink-0 place-items-center rounded-full bg-cobalt text-[26px] font-bold ring-4 ring-white/10"
          aria-hidden
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[22px] leading-tight font-bold tracking-[-0.01em]">{name}</p>
          <p className="truncate text-white/70">{session.email ?? (session.method === "demo" ? "Sample data" : "Signed in with a Sui wallet")}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] font-semibold">
            <ShieldCheck className="size-3.5" aria-hidden />
            {methodLabel(session)}
          </span>
        </div>
      </div>

      {/* An email-only account's address is an internal id nobody holds keys for, so it is never shown as a wallet. */}
      {session.method !== "email" && (
      <button
        type="button"
        onClick={copyAddress}
        title={session.address}
        className="flex min-h-11 items-center justify-between gap-4 rounded-xl bg-white/10 px-4 py-2.5 text-left transition-colors hover:bg-white/15 sm:min-w-64"
      >
        <span>
          <span className="block text-[12px] text-white/70">{session.method === "demo" ? "Demo wallet (sample)" : "Your Sui address"}</span>
          <span className="block font-semibold tabular-nums">{shortAddress(session.address)}</span>
        </span>
        {copied ? <Check className="size-5" aria-label="Copied" /> : <Copy className="size-5 text-white/70" aria-label="Copy address" />}
      </button>
      )}
    </section>
  );
}

function DetailsForm({ base, canSave }: { base: Profile; canSave: boolean }) {
  const { saveProfile } = useAuth();
  const { data, addMemory, reload } = useAppData();
  const toast = useToast();
  const [name, setName] = useState(base.name);
  const [payday, setPayday] = useState(base.payday);
  const [sources, setSources] = useState(base.sources);
  const [currency, setCurrency] = useState(base.currency ?? data.currency);
  const currencies = useMemo(() => currencyOptions(), []);

  const dirty =
    name.trim() !== base.name ||
    payday !== base.payday ||
    sources.csv !== base.sources.csv ||
    sources.sui !== base.sources.sui ||
    currency !== (base.currency ?? data.currency);

  function discard() {
    setName(base.name);
    setPayday(base.payday);
    setSources(base.sources);
    setCurrency(base.currency ?? data.currency);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim()) return;
    const next: Profile = { ...base, name: name.trim(), payday, sources, currency };
    const memory = payday !== base.payday ? paydayMemory(next) : null;
    try {
      await saveProfile(next);
    } catch (err) {
      toast.error({ title: "Couldn't save your profile", description: err instanceof ApiError ? err.message : "Try again in a moment." });
      return;
    }
    // The backend remembers a new payday itself, and converts accounts into a new currency.
    if (data.source === "live") void reload();
    else if (memory) addMemory({ kind: "preference", ...memory, source: "You updated your profile" });
    toast.success({
      title: "Profile saved",
      description: memory ? `Sovra will remember ${memory.highlight === "irregular" ? "your income is irregular" : `you're ${memory.highlight}`}.` : undefined,
    });
  }

  return (
    <Panel title="Your details">
      <form onSubmit={save} className="flex flex-col gap-5">
        <Field label="Name" hint="What Sovra calls you." error={name.trim() ? undefined : "Add a name so Sovra knows what to call you."}>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </Field>

        <Field
          label="Currency"
          hint="Totals, budgets and goals show in it. Budget and goal amounts keep their numbers, so update them if you switch."
        >
          <select className={fieldClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="When are you paid?" hint="Sovra won't nag about a low balance in the days before payday.">
          <select
            className={fieldClass}
            value={payday === undefined ? "" : String(payday)}
            onChange={(e) => setPayday(e.target.value === "irregular" ? "irregular" : Number(e.target.value))}
          >
            {payday === undefined && (
              <option value="" disabled>
                Not set
              </option>
            )}
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                On the {ordinal(d)} of each month
              </option>
            ))}
            <option value="irregular">My income is irregular</option>
          </select>
        </Field>

        <fieldset>
          <legend className="mb-2 text-[14px] font-semibold">Where your money lives</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {SOURCES.map((s) => {
              const on = sources[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSources({ ...sources, [s.key]: !on })}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                    on ? "border-cobalt bg-cobalt-soft/40" : "border-line hover:border-field"
                  }`}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-card text-cobalt shadow-card">
                    <s.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{s.title}</span>
                    <span className="block text-[13px] text-muted">{s.body}</span>
                  </span>
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
                      on ? "border-cobalt bg-cobalt text-white" : "border-field"
                    }`}
                  >
                    {on && <Check className="size-3" aria-hidden />}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={!canSave || !dirty || !name.trim()}>
            Save changes
          </Button>
          {dirty && (
            <Button variant="quiet" onClick={discard}>
              Discard
            </Button>
          )}
          {!canSave && <span className="text-[13px] text-muted">Sign in to save changes.</span>}
        </div>
      </form>
    </Panel>
  );
}

function LinkRow({ to, icon: Icon, title, body }: { to: string; icon: LucideIcon; title: string; body?: string }) {
  return (
    <li>
      <Link to={to} className="-mx-2 flex min-h-14 items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-porcelain">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {body && <span className="block text-[13px] text-muted">{body}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

const SERVER_STATUS = {
  idle: { text: "Not signed in", tone: "text-muted" },
  checking: { text: "Checking…", tone: "text-muted" },
  verified: { text: "Verified", tone: "text-gain" },
  unavailable: { text: "Offline, this browser only", tone: "text-muted" },
  failed: { text: "Couldn't verify. Log out and in again", tone: "text-over" },
} as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export default function ProfilePage() {
  useTitle("Profile");
  const auth = useAuth();
  const { data } = useAppData();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const toast = useToast();

  // Route guards can be off in development, so the page also renders signed out.
  const session: Session = auth.session ?? { method: "demo", address: "", name: "" };
  const name = auth.profile?.name || session.name || "You";
  const base: Profile = auth.profile ?? { name: session.name, onboarded: false, sources: { csv: false, sui: true } };
  const facts = memoriesFromProfile(base);

  async function logOut() {
    try {
      await auth.signOut();
      toast.info("You're logged out");
      navigate("/");
    } catch {
      toast.error({ title: "Couldn't log out", description: "Try again, or close this tab to end the session." });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile and settings" description="Your details, how you sign in, and what Sovra remembers about you." />

      {auth.session && <IdentityCard session={auth.session} name={name} />}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          {/* Keyed so the form resets to the saved values after a save or sign-in. */}
          <DetailsForm key={JSON.stringify(base)} base={base} canSave={!!auth.session} />

          <Panel title="Accounts and policies">
            <ul className="flex flex-col">
              <LinkRow to="/app/accounts" icon={Wallet} title="Wallet and accounts" body="Sui wallet, statements, top-up" />
              <LinkRow to="/security" icon={ShieldCheck} title="How Sovra keeps you safe" body="What Sovra can see, and what it never can" />
              <LinkRow to="/privacy" icon={FileText} title="Privacy" />
              <LinkRow to="/terms" icon={FileText} title="Terms" />
            </ul>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Sign-in">
            <dl className="divide-y divide-line">
              <Row label="Signed in with">{auth.session ? methodLabel(session) : "Not signed in"}</Row>
              {session.method === "wallet" && (
                <Row label="Email sign-in">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                    <span className={auth.passwordEmail ? "" : "font-normal text-muted"}>{auth.passwordEmail ?? "Not set up"}</span>
                    <button
                      type="button"
                      onClick={() => setLinking(true)}
                      disabled={auth.server !== "verified"}
                      className="text-[14px] font-semibold text-cobalt hover:underline disabled:opacity-50 disabled:hover:no-underline"
                    >
                      {auth.passwordEmail ? "Change" : "Add email and password"}
                    </button>
                  </span>
                </Row>
              )}
              <Row label="Session">Kept in this browser until you log out</Row>
              <Row label={session.method === "wallet" && !session.viaPassword ? "Address ownership" : "Server session"}>
                <span className={SERVER_STATUS[auth.server].tone}>
                  {auth.server === "verified" && session.method === "wallet" && !session.viaPassword
                    ? "Verified by signature"
                    : SERVER_STATUS[auth.server].text}
                </span>
              </Row>
            </dl>
            <p className="mt-4 rounded-xl bg-porcelain px-4 py-3 text-[14px] text-muted">
              {session.method === "demo"
                ? "The demo account uses sample data. It's private to you and is deleted when it expires."
                : session.viaPassword
                  ? "Your password is stored only as a scrypt hash, so Sovra can check it but never read it."
                  : "Your wallet signed a one-time message to prove the address is yours. Sovra never sees your keys and can't move money."}
            </p>
            <EmailSignInDialog open={linking} onClose={() => setLinking(false)} />
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-2">
                <Highlighter className="size-4 text-cobalt" aria-hidden />
                Memory vault
              </span>
            }
            action={<span className="rounded-full bg-cobalt-soft px-2.5 py-0.5 text-[12px] font-semibold text-cobalt">Walrus mainnet</span>}
          >
            <p className="text-[32px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
              {memoryCount(data)} <span className="text-[15px] font-semibold tracking-normal text-muted">memories</span>
            </p>
            {facts.length > 0 && (
              <>
                <p className="mt-5 text-[13px] font-semibold text-muted">From your setup</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {facts.map((f) => (
                    <li key={f.text} className="rounded-lg border border-line px-3 py-2 text-[14px]">
                      <Remembered text={f.text} highlight={f.highlight} />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] text-muted">
                  Change your goal on{" "}
                  <Link to="/app/goals" className="font-semibold text-cobalt underline-offset-2 hover:underline">
                    Goals
                  </Link>{" "}
                  and limits on{" "}
                  <Link to="/app/budgets" className="font-semibold text-cobalt underline-offset-2 hover:underline">
                    Budgets
                  </Link>
                  .
                </p>
              </>
            )}
            <Link to="/app/memory" className={`${buttonClass("secondary")} mt-5 w-full sm:w-auto`}>
              Review everything Sovra remembers
            </Link>
          </Panel>
        </div>
      </div>

      {auth.session && (
        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-muted">Logging out clears your session from this browser.</p>
          <button
            type="button"
            onClick={logOut}
            className={`${buttonClass("secondary")} w-full text-over hover:border-over hover:bg-over-soft sm:w-auto`}
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

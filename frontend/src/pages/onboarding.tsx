import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { Check, FileSpreadsheet, KeyRound, Lock, Wallet } from "lucide-react";
import { CsvDrop } from "@/components/accounts/csv-drop";
import { RequireSession } from "@/components/auth/guards";
import { Wordmark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field-class";
import { Chip, Field, MoneyInput } from "@/components/ui/form-controls";
import { Remembered } from "@/components/ui/remembered";
import { spentThisMonth, useAppData } from "@/lib/app-data";
import { firstName, useAuth, type Profile } from "@/lib/auth-context";
import { ROUTE_GUARDS_ENABLED } from "@/lib/config";
import { CATEGORIES, DEMO_WALLET_ADDRESS, type CategoryId } from "@/lib/demo-data";
import { shortAddress } from "@/lib/format";
import {
  goalMemory,
  limitMemory,
  memoriesFromProfile,
  nameMemory,
  ordinal,
  paydayMemory,
  sourcesMemory,
  upcomingMonths,
  type MemoryDraft,
} from "@/lib/onboarding";
import { useToast } from "@/lib/toast-context";
import { useTitle } from "@/lib/use-title";

const STEPS = ["About you", "Your money", "Your goal", "Your limit"] as const;
const MONTH_OPTIONS = upcomingMonths(24);
const GOAL_IDEAS = ["A laptop", "Rent deposit", "Emergency fund", "Trip home", "New phone"];
const LIMIT_CATEGORIES: CategoryId[] = ["entertainment", "food", "shopping", "transport", "health", "bills"];
const LIMIT_AMOUNTS = [50, 100, 150, 250];

function StepHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1 className="mt-2 text-[34px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[40px]">{title}</h1>
      <p className="mt-2 max-w-[52ch] text-[17px] text-muted">{children}</p>
    </>
  );
}

/** One ruled line in the memory panel. */
function LedgerLine({ n, label, memory, current }: { n: number; label: string; memory: MemoryDraft | null; current: boolean }) {
  return (
    <li
      className={`relative grid grid-cols-[28px_1fr] gap-3 border-b border-white/10 py-4 pl-3 transition-colors ${
        current ? "bg-white/[0.04]" : ""
      }`}
    >
      {current && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-signal" aria-hidden />}
      <span className="pt-0.5 text-[13px] text-white/55 tabular-nums">{String(n).padStart(2, "0")}</span>
      {memory ? (
        <p className="text-[16px] leading-relaxed text-white">
          <Remembered text={memory.text} highlight={memory.highlight} />
        </p>
      ) : (
        <p className="text-[16px] text-white/55">{current ? `${label}, as you type` : label}</p>
      )}
    </li>
  );
}

function OnboardingFlow() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { addMemory, upsertBudget } = useAppData();
  // Without route guards someone can arrive here signed out; fall back to the demo wallet.
  const session = auth.session ?? { method: "demo" as const, address: DEMO_WALLET_ADDRESS, name: "" };
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>(() => ({
    name: auth.profile?.name || firstName(auth),
    onboarded: false,
    sources: { csv: false, sui: true },
    goal: { name: "", target: 0, due: MONTH_OPTIONS[3].value },
    limit: { category: "entertainment", amount: 0 },
    payday: 25,
  }));
  useTitle("Set up Sovra");

  if (ROUTE_GUARDS_ENABLED && auth.profile?.onboarded) return <Navigate to="/app" replace />;

  const last = step === STEPS.length - 1;
  const canContinue = step !== 0 || draft.name.trim().length > 0;
  const ledger = [
    { label: "Your name", memory: nameMemory(draft) },
    { label: "Where your money lives", memory: sourcesMemory(draft) },
    { label: "What you're saving for", memory: goalMemory(draft) },
    { label: "When you're paid", memory: paydayMemory(draft) },
    { label: "Your spending limit", memory: limitMemory(draft) },
  ];
  // Ledger lines the current step writes to; the goal step fills both goal and payday.
  const currentLines = [[0], [1], [2, 3], [4]][step];

  function update(patch: Partial<Profile>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function finish(profile: Profile) {
    const clean: Profile = {
      ...profile,
      name: profile.name.trim(),
      goal: profile.goal?.name.trim() && profile.goal.target > 0 ? profile.goal : undefined,
      limit: profile.limit && profile.limit.amount > 0 ? profile.limit : undefined,
      onboarded: true,
    };
    auth.saveProfile(clean);
    const facts = [
      { kind: "goal" as const, memory: goalMemory(clean) },
      { kind: "preference" as const, memory: paydayMemory(clean) },
      { kind: "limit" as const, memory: limitMemory(clean) },
    ];
    for (const { kind, memory } of facts) {
      if (memory) addMemory({ kind, ...memory, source: "You told Sovra during setup" });
    }
    if (clean.limit) {
      upsertBudget({ category: clean.limit.category, limit: clean.limit.amount, spent: spentThisMonth(clean.limit.category) });
    }
    const saved = memoriesFromProfile(clean).length;
    toast.success({
      title: clean.name ? `Welcome to Sovra, ${clean.name}` : "Welcome to Sovra",
      description: saved
        ? `Sovra will remember ${saved} thing${saved === 1 ? "" : "s"} you told it.`
        : "Add a goal any time from the Goals page.",
    });
    navigate("/app", { replace: true });
  }

  function next(e?: FormEvent) {
    e?.preventDefault();
    if (!canContinue) return;
    if (last) finish(draft);
    else setStep((s) => s + 1);
  }

  function skipStep() {
    const cleared: Partial<Profile> =
      step === 2
        ? { goal: { name: "", target: 0, due: MONTH_OPTIONS[3].value } }
        : { limit: { category: "entertainment", amount: 0 } };
    if (last) finish({ ...draft, ...cleared });
    else {
      update(cleared);
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-8 lg:grid-cols-[1fr_minmax(0,560px)_1fr] lg:px-12">
        <Wordmark className="text-[22px]" />
        <ol className="order-3 col-span-2 grid grid-cols-4 gap-2 lg:order-none lg:col-span-1" aria-label="Setup progress">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full transition-colors ${i <= step ? "bg-cobalt" : "bg-track"}`} />
              <span
                className={`mt-2 hidden items-center gap-1.5 text-[13px] sm:flex ${i === step ? "font-semibold text-ink" : "text-muted"}`}
              >
                {i < step && <Check className="size-3.5 text-gain" aria-hidden />}
                {label}
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => finish({ ...draft, goal: undefined, limit: undefined })}
          className="justify-self-end text-[14px] font-semibold text-muted hover:text-ink"
        >
          Skip setup
        </button>
      </header>

      <main className="grid flex-1 gap-5 px-5 pb-8 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:px-12 lg:pb-12">
        <form onSubmit={next} className="flex flex-col rounded-[20px] bg-card p-6 shadow-card sm:p-10 xl:p-14">
          <p className="text-[14px] font-semibold text-cobalt">
            Step {step + 1} of {STEPS.length}
          </p>

          {step === 0 && (
            <>
              <StepHeading title="Your account is ready">
                A couple of quick questions and Sovra knows enough to be useful.
              </StepHeading>
              <div className="mt-8 flex gap-4 rounded-2xl bg-porcelain p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-cobalt shadow-card">
                  <KeyRound className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">
                    Your Sui address <span className="tabular-nums">{shortAddress(session.address)}</span>
                  </p>
                  <p className="mt-1 text-[14px] text-muted">
                    {session.method === "google"
                      ? "Created from your Google sign-in with zkLogin. No seed phrase to keep safe."
                      : "This is the demo wallet. Sign in with Google to get your own address."}
                  </p>
                </div>
              </div>
              <div className="mt-8 max-w-[440px]">
                <Field label="What should Sovra call you?">
                  <input
                    className={fieldClass}
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Your first name"
                    autoFocus
                  />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <StepHeading title="Where does your money live?">
                Pick everything that applies. Sovra only reads; it never moves money.
              </StepHeading>
              <div className="mt-8 grid gap-3 xl:grid-cols-2">
                {(
                  [
                    { key: "sui", icon: Wallet, title: "USDC on Sui", body: `Read live through Tatum at ${shortAddress(session.address)}.` },
                    { key: "csv", icon: FileSpreadsheet, title: "Bank statements", body: "Upload a CSV export from any bank." },
                  ] as const
                ).map((s) => {
                  const on = draft.sources[s.key];
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => update({ sources: { ...draft.sources, [s.key]: !on } })}
                      className={`flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-colors ${
                        on ? "border-cobalt bg-cobalt-soft/40" : "border-line hover:border-muted/40"
                      }`}
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-cobalt shadow-card">
                        <s.icon className="size-5" aria-hidden />
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold">{s.title}</span>
                        <span className="block text-[14px] text-muted">{s.body}</span>
                      </span>
                      <span
                        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                          on ? "border-cobalt bg-cobalt text-white" : "border-line"
                        }`}
                      >
                        {on && <Check className="size-3.5" aria-hidden />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {draft.sources.csv && (
                <div className="mt-4">
                  <CsvDrop />
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <StepHeading title="What are you saving for?">Sovra checks every spending question against this.</StepHeading>
              <div className="mt-8 flex flex-col gap-6">
                <div>
                  <Field label="Goal">
                    <input
                      className={fieldClass}
                      value={draft.goal?.name ?? ""}
                      onChange={(e) => update({ goal: { ...draft.goal!, name: e.target.value } })}
                      placeholder="Name your goal"
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {GOAL_IDEAS.map((g) => (
                      <Chip key={g} active={draft.goal?.name === g} onClick={() => update({ goal: { ...draft.goal!, name: g } })}>
                        {g}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Amount">
                    <MoneyInput
                      value={draft.goal?.target ?? 0}
                      onChange={(n) => update({ goal: { ...draft.goal!, target: n } })}
                      placeholder="1,200"
                    />
                  </Field>
                  <Field label="By">
                    <select
                      className={fieldClass}
                      value={draft.goal?.due}
                      onChange={(e) => update({ goal: { ...draft.goal!, due: e.target.value } })}
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="When are you paid?" hint="Sovra won't nag about a low balance in the days before payday.">
                  <select
                    className={fieldClass}
                    value={String(draft.payday)}
                    onChange={(e) => update({ payday: e.target.value === "irregular" ? "irregular" : Number(e.target.value) })}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        On the {ordinal(d)} of each month
                      </option>
                    ))}
                    <option value="irregular">My income is irregular</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <StepHeading title="Set one spending limit">
                Start with the category that gets away from you. You can add more later.
              </StepHeading>
              <div className="mt-8 flex flex-col gap-6">
                <div>
                  <p className="mb-2 text-[14px] font-semibold">Category</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
                    {LIMIT_CATEGORIES.map((c) => (
                      <Chip key={c} active={draft.limit?.category === c} onClick={() => update({ limit: { ...draft.limit!, category: c } })}>
                        {CATEGORIES[c]}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="max-w-[440px]">
                  <Field label="Monthly limit">
                    <MoneyInput
                      value={draft.limit?.amount ?? 0}
                      onChange={(n) => update({ limit: { ...draft.limit!, amount: n } })}
                      placeholder="100"
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LIMIT_AMOUNTS.map((a) => (
                      <Chip key={a} active={draft.limit?.amount === a} onClick={() => update({ limit: { ...draft.limit!, amount: a } })}>
                        ${a}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Pushes the actions to the bottom of the card, keeping at least 2.5rem above them. */}
          <div className="min-h-10 flex-1" aria-hidden />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            {step > 0 && (
              <Button variant="secondary" className="h-12 px-5" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" className="h-12 px-6" disabled={!canContinue}>
              {last ? "Finish setup" : "Continue"}
            </Button>
            {(step === 2 || step === 3) && (
              <button type="button" onClick={skipStep} className="ml-auto text-[14px] font-semibold text-muted hover:text-ink">
                Skip this step
              </button>
            )}
          </div>
        </form>

        <aside className="relative flex flex-col overflow-hidden rounded-[20px] bg-ink p-6 text-white sm:p-10 xl:p-14" aria-live="polite">
          <h2 className="text-[24px] font-extrabold tracking-[-0.02em]">What Sovra will remember</h2>
          <p className="mt-2 max-w-[44ch] text-white/60">Each answer becomes a line in your memory. Watch it fill in as you go.</p>

          <ol className="mt-8 border-t border-white/10">
            {ledger.map((line, i) => (
              <LedgerLine key={line.label} n={i + 1} label={line.label} memory={line.memory} current={currentLines.includes(i)} />
            ))}
          </ol>

          <p className="mt-auto flex items-start gap-2.5 pt-8 text-[14px] text-white/60">
            <Lock className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
            Saved encrypted to your Walrus vault when you finish. Change or forget any line later on the Memory page.
          </p>
        </aside>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireSession>
      <OnboardingFlow />
    </RequireSession>
  );
}

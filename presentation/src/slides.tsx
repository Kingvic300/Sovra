import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Brain,
  Check,
  CircleDashed,
  Database,
  FileSearch,
  KeyRound,
  Lock,
  MessageSquareText,
  PenLine,
  RefreshCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wallet,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Bar, Card, Chip, Crop, cx, d, Kicker, Logo, money, Remembered, Shot, Wordmark, type ScreenName } from "./ui";

export const APP_URL = "https://sovra.vercel.app";
export const REPO_URL = "https://github.com/Kingvic300/Sovra";

export type SlideProps = { active: boolean };
/** Speaker notes: the slot in the 3-minute pitch and the script for it. */
export type Notes = { time?: string; script: string };
export type SlideDef = { id: string; title: string; tone: "light" | "dark"; Component: ComponentType<SlideProps>; notes?: Notes; appendix?: boolean };

function Frame({ tone = "light", children, className }: { tone?: "light" | "dark"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "relative flex h-full w-full flex-col overflow-hidden px-[110px] pt-[96px] pb-[120px]",
        tone === "dark" ? "grid-dots-dark bg-ink text-white" : "grid-dots bg-porcelain text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Fills the space under a slide heading and centers its content vertically. */
function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-h-0 flex-1 flex-col justify-center pt-10", className)}>{children}</div>;
}

function H({ children, className, delay = 80 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <h2 className={cx("rise mt-6 text-[76px] leading-[1.02] font-bold tracking-[-0.035em]", className)} style={d(delay)}>
      {children}
    </h2>
  );
}

function Lead({ children, className, delay = 180 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <p className={cx("rise mt-7 max-w-[640px] text-[25px] leading-[1.45] text-muted", className)} style={d(delay)}>
      {children}
    </p>
  );
}

/* 1 ─ Title */
function TitleSlide() {
  return (
    <Frame className="justify-center">
      <div className="pointer-events-none absolute -top-40 -right-40 size-[720px] rounded-full bg-cobalt/10 blur-3xl" />
      <div className="grid w-full grid-cols-[1.18fr_1fr] items-center gap-14">
        <div>
          <div className="rise" style={d(0)}>
            <Wordmark />
          </div>
          <p className="rise mt-10 text-[19px] font-semibold text-cobalt" style={d(80)}>
            Personal finance with memory · Walrus, Tatum and Sui
          </p>
          <h1 className="rise mt-5 text-[98px] leading-[0.98] font-bold tracking-[-0.045em]" style={d(140)}>
            The money app
            <br />
            that <Remembered draw>remembers</Remembered>
            <br />
            your goals.
          </h1>
          <p className="rise mt-8 max-w-[600px] text-[24px] leading-[1.45] text-muted" style={d(260)}>
            A personal finance platform built on one simple idea: your financial app should remember you.
          </p>
          <div className="rise mt-9 flex gap-3" style={d(360)}>
            <Chip tone="cobalt" className="px-4 py-1.5 text-[16px]">Total Recall hackathon</Chip>
            <Chip className="px-4 py-1.5 text-[16px]">Consumer Finance Apps</Chip>
          </div>
          <p className="rise mt-8 text-[18px] text-muted" style={d(440)}>
            Built by <b className="text-ink">Victor</b> and <b className="text-ink">Ladipo</b>
          </p>
        </div>
        <HeroVisual />
      </div>
    </Frame>
  );
}

function HeroVisual() {
  return (
    <div className="relative h-[640px]">
      <Shot name="memory" url="/app/memory" className="pop absolute top-0 right-[-40px] h-[440px] w-[700px] rotate-[3deg]" style={d(250)} />
      <Shot name="overview" url="/app" className="pop absolute top-[150px] left-[-10px] h-[460px] w-[720px] -rotate-[1.5deg]" style={d(450)} />
      <div className="pop absolute right-[10px] bottom-[-6px] z-10 flex items-center gap-3 rounded-full bg-card py-2.5 pr-5 pl-2.5 shadow-pop ring-1 ring-line" style={d(900)}>
        <span className="grid size-9 place-items-center rounded-full bg-cobalt-soft text-cobalt">
          <Wallet className="size-[18px]" />
        </span>
        <span className="text-[17px]">
          <b className="tabular-nums">14 memories</b> <span className="text-muted">on Walrus · USDC live via Tatum</span>
        </span>
      </div>
    </div>
  );
}

/* 2 ─ Problem */
function ProblemSlide() {
  const said = ["Saving for a laptop", "Entertainment under $100", "Amazon is business, not shopping", "Low balance before payday is normal"];
  return (
    <Frame tone="dark">
      <div className="grid h-full grid-cols-[1fr_1.05fr] items-center gap-20">
        <div>
          <Kicker tone="dark">The problem</Kicker>
          <H>
            Money apps
            <br />
            have amnesia.
          </H>
          <Lead className="text-white/65">
            You set a budget, correct a transaction, explain your habits, set goals. When you come back, a lot of that context is gone, so you repeat the
            same instructions and fix the same mistakes.
          </Lead>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {[
            { month: "September", note: "You explain everything", faded: false },
            { month: "October", note: "Explain it all again", faded: true },
          ].map((col, ci) => (
            <div key={col.month} className="pop rounded-card bg-ink-2 p-6 ring-1 ring-white/10" style={d(250 + ci * 250)}>
              <p className="text-[15px] font-semibold tracking-[0.12em] text-white/45 uppercase">{col.month}</p>
              <p className="mt-1 text-[22px] font-semibold">{col.note}</p>
              <div className="mt-5 space-y-2.5">
                {said.map((s, i) => (
                  <p
                    key={s}
                    className={cx("rise rounded-lg px-3.5 py-2.5 text-[16.5px]", col.faded ? "bg-white/5 text-white/35 line-through decoration-over/80" : "bg-white/10 text-white/90")}
                    style={d(450 + ci * 300 + i * 90)}
                  >
                    {s}
                  </p>
                ))}
              </div>
              {col.faded && (
                <p className="rise mt-5 flex items-center gap-2 text-[16px] text-[#ff8a8e]" style={d(1200)}>
                  <RefreshCcw className="size-4" /> Forgotten at logout
                </p>
              )}
            </div>
          ))}
          <p className="rise col-span-2 text-center text-[20px] text-white/55" style={d(1300)}>
            Same instructions. Same corrections. Same generic advice.
          </p>
        </div>
      </div>
    </Frame>
  );
}

/* 3 ─ Solution */
function SolutionSlide() {
  return (
    <Frame>
      <div className="grid h-full grid-cols-[1fr_1.05fr] items-center gap-20">
        <div>
          <Kicker>The solution</Kicker>
          <H>
            Meet Sovra.
            <br />
            It <Remembered draw>remembers</Remembered>.
          </H>
          <Lead>
            Every goal, limit, correction and decision becomes a memory in plain words. Before Sovra shows a budget warning or answers a question, it recalls
            what you told it.
          </Lead>
          <p className="rise mt-8 text-[21px] font-semibold" style={d(300)}>
            Advice gets more personal every week, instead of resetting every login.
          </p>
        </div>
        <div className="relative">
          <Shot name="home" className="pop h-[560px] w-full" style={d(200)} />
          <p className="rise mt-4 text-center text-[15px] text-muted" style={d(500)}>
            The live Sovra landing page
          </p>
        </div>
      </div>
    </Frame>
  );
}

/* 4 ─ How it works */
function LoopSlide() {
  const steps = [
    { icon: PenLine, title: "Tell it once", body: "Set a goal, fix a category, explain a big expense. Plain words or one tap.", tag: "onboarding · edits · choices" },
    { icon: Database, title: "Remember", body: "Sovra writes each one as a memory in your own Walrus namespace.", tag: "remember()" },
    { icon: Brain, title: "Recall", body: "Before a budget check or an answer, Sovra pulls what matters.", tag: "recall()" },
    { icon: Sparkles, title: "Act, and learn", body: "Advice shows which memories it used. Your choice becomes a new memory.", tag: "decision → memory" },
  ];
  return (
    <Frame>
      <Kicker>How it works</Kicker>
      <H>A learning loop, not a dashboard.</H>
      <Body>
      <div className="relative grid grid-cols-4 gap-6">
        {steps.map((s, i) => (
          <Card key={s.title} className="pop relative flex flex-col p-8" style={d(250 + i * 150)}>
            <div className="flex items-center justify-between">
              <span className="grid size-13 place-items-center rounded-2xl bg-cobalt-soft text-cobalt">
                <s.icon className="size-6" />
              </span>
              <span className="text-[44px] font-bold text-track">0{i + 1}</span>
            </div>
            <p className="mt-7 text-[30px] font-bold tracking-tight">{s.title}</p>
            <p className="mt-2 mb-8 text-[20px] leading-relaxed text-muted">{s.body}</p>
            <p className="mt-auto w-fit rounded-md bg-ink px-2.5 py-1 font-mono text-[14px] text-white">{s.tag}</p>
            {i < 3 && (
              <span className="absolute top-1/2 -right-[22px] z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-porcelain ring-1 ring-line">
                <ArrowRight className="size-5 text-cobalt" />
              </span>
            )}
          </Card>
        ))}
      </div>
      <div className="rise mt-8 flex items-center gap-4 text-[19px] text-muted" style={d(900)}>
        <svg width="320" height="22" aria-hidden>
          <path d="M2 4 Q 2 18 20 18 L 300 18 Q 318 18 318 4" fill="none" stroke="#2340D0" strokeWidth="2" strokeDasharray="6 6" style={{ animation: "dash 1s linear infinite" }} />
        </svg>
        Every decision feeds the next one. The longer you use it, the better it fits.
      </div>
      </Body>
    </Frame>
  );
}

/* 5 ─ Worked example */
function ExampleSlide() {
  return (
    <Frame>
      <Kicker>Worked example</Kicker>
      <H>September you talk. October Sovra acts.</H>
      <Body>
      <div className="grid grid-cols-[0.8fr_1.25fr_0.95fr] gap-6">
        <Card className="pop p-7" style={d(200)}>
          <p className="text-[15px] font-semibold tracking-[0.12em] text-muted uppercase">14 September</p>
          <p className="mt-2 text-[23px] font-bold">Ada tells Sovra</p>
          <div className="mt-5 space-y-3 text-[18px]">
            <p className="rounded-xl bg-porcelain px-4 py-3">
              Saving for a <Remembered>laptop, $1,200 by January</Remembered>
            </p>
            <p className="rounded-xl bg-porcelain px-4 py-3">
              Keep entertainment <Remembered>under $100 a month</Remembered>
            </p>
          </div>
        </Card>
        <Card className="pop p-7" style={d(400)}>
          <p className="text-[15px] font-semibold tracking-[0.12em] text-muted uppercase">27 October</p>
          <p className="mt-2 text-[23px] font-bold">Renewals are coming</p>
          <div className="mt-6 flex items-end justify-between">
            <span className="text-[17px] font-semibold">Entertainment</span>
            <span className="text-[30px] font-bold text-over tabular-nums">
              $111 <span className="text-[18px] font-medium text-muted">/ $100</span>
            </span>
          </div>
          <div className="grow-x mt-3" style={d(700)}>
            <Bar value={82} max={100} pending={29} tone="over" className="h-5" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-[15px]">
            <Stat label="Spent" value={money(82, false)} />
            <Stat label="Spotify renews" value={money(10.99)} hatch />
            <Stat label="Netflix renews" value={money(17.99)} hatch />
          </div>
          <p className="mt-5 text-[16px] text-muted">Sovra counts renewals before they land, shown hatched.</p>
        </Card>
        <div className="flex flex-col gap-4">
          <div className="pop rounded-card border-2 border-highlighter bg-[#fffbe6] p-6 shadow-pop" style={d(900)}>
            <p className="text-[21px] leading-snug font-semibold">Netflix renews Friday and puts you $11 over. Pause it?</p>
            <p className="mt-2 text-[16px] text-muted">Keeps the laptop fund on track.</p>
            <div className="mt-4 flex gap-2">
              <span className="rounded-lg bg-cobalt px-4 py-2 text-[16px] font-semibold text-white">Pause Netflix</span>
              <span className="rounded-lg bg-card px-4 py-2 text-[16px] font-semibold ring-1 ring-line">Keep it</span>
            </div>
          </div>
          <div className="pop flex items-start gap-3 rounded-card bg-ink p-5 text-white" style={d(1150)}>
            <Check className="mt-1 size-5 shrink-0 text-highlighter" />
            <p className="text-[17px] leading-snug">
              New memory: <Remembered>paused Netflix</Remembered> for the laptop. Next month, Sovra already knows.
            </p>
          </div>
        </div>
      </div>
      <div className="rise mt-8 flex items-center gap-3 font-mono text-[15px] text-muted" style={d(1300)}>
        {["14 Sep · remember(goal, limit)", "27 Oct · recall() before the budget check", "31 Oct · remember(decision)"].map((t, i) => (
          <span key={t} className="flex items-center gap-3">
            {i > 0 && <ArrowRight className="size-4 text-cobalt" />}
            <span className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-line">{t}</span>
          </span>
        ))}
      </div>
      </Body>
    </Frame>
  );
}

function Stat({ label, value, hatch = false }: { label: string; value: string; hatch?: boolean }) {
  return (
    <div className="rounded-xl bg-porcelain p-3">
      <p className="flex items-center gap-1.5 text-muted">
        <span className={cx("size-3 rounded-sm", hatch ? "hatch-over" : "bg-over")} />
        {label}
      </p>
      <p className="mt-1 text-[19px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

/* 6 ─ Architecture */
function StackSlide() {
  return (
    <Frame>
      <div className="flex items-end justify-between">
        <div>
          <Kicker>Why Walrus, Tatum and Sui</Kicker>
          <H>Memory you own. Money read live.</H>
        </div>
      </div>
      <Body>
      <div className="grid grid-cols-[1fr_auto_1.35fr] items-stretch gap-6">
        <div className="pop flex flex-col rounded-card bg-card p-7 shadow-card ring-1 ring-line" style={d(200)}>
          <p className="text-[14px] font-semibold tracking-[0.14em] text-muted uppercase">Off-chain · Sovra</p>
          <div className="mt-5 space-y-4">
            <Node icon={Server} title="NestJS backend + Postgres" body="Statements, budgets, goals, recurring bills" />
            <Node icon={MessageSquareText} title="Groq · gpt-oss-120b / 20b" body="Answers and merchant categorization, grounded in your data" />
            <Node icon={ShieldCheck} title="Read-only by design" body="Never moves money, never holds funds" />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 text-[14px] font-semibold text-cobalt">
          <span className="rise rounded-full bg-cobalt-soft px-3 py-1" style={d(500)}>remember()</span>
          <ArrowRight className="size-7" />
          <span className="rise rounded-full bg-cobalt-soft px-3 py-1" style={d(600)}>recall()</span>
          <ArrowRight className="size-7 rotate-180" />
          <span className="rise rounded-full bg-cobalt-soft px-3 py-1" style={d(700)}>balance</span>
        </div>
        <div className="pop flex flex-col rounded-card bg-ink p-7 text-white" style={d(400)}>
          <p className="text-[14px] font-semibold tracking-[0.14em] text-white/50 uppercase">On-chain · Sui mainnet</p>
          <div className="mt-5 grid grid-cols-3 gap-4">
            <ChainCard
              name="Walrus Memory"
              lines={["Goals, limits, corrections, decisions", "One namespace per user, keyed to the wallet", "Encrypted, on mainnet"]}
            />
            <ChainCard name="Tatum Sui gateway" lines={["USDC balance and transfers", "Watches top-up deposits", "Sui mainnet GraphQL, one API key"]} />
            <ChainCard name="Sui wallet" lines={["Sign in with any wallet or Slush", "One signed challenge, no password", "Never asked to approve a transaction"]} />
          </div>
        </div>
      </div>
      <p className="rise mt-8 text-[19px] text-muted" style={d(900)}>
        Walrus holds what Sovra knows about you. Tatum tells it what you actually have. Neither needs a bank password.
      </p>
      </Body>
    </Frame>
  );
}

function Node({ icon: Icon, title, body }: { icon: ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="flex gap-4 rounded-xl bg-porcelain p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-cobalt ring-1 ring-line">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-[18px] font-semibold">{title}</p>
        <p className="text-[15.5px] text-muted">{body}</p>
      </div>
    </div>
  );
}

function ChainCard({ name, lines }: { name: string; lines: string[] }) {
  return (
    <div className="rounded-xl bg-white/6 p-5 ring-1 ring-white/10">
      <p className="text-[19px] font-bold">{name}</p>
      <ul className="mt-3 space-y-2.5">
        {lines.map((l) => (
          <li key={l} className="flex gap-2 text-[15px] leading-snug text-white/70">
            <Check className="mt-0.5 size-4 shrink-0 text-signal" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 7 ─ Trust */
function TrustSlide() {
  const cards = [
    { icon: Lock, title: "Never touches your money", body: "No bank password. One signature to sign in. Sovra reads balances and never asks a wallet to approve a transaction." },
    { icon: Undo2, title: "You control the memory", body: "Every memory in plain words. Forget anything, with Undo, and Sovra stops using it right away." },
    { icon: FileSearch, title: "Private audit in a TEE", body: "Receipts and statements checked by a model inside NEAR AI Cloud's TEE. Attestation verified, nothing stored." },
    { icon: KeyRound, title: "Spending guard", body: "A policy engine, scam detection and scoped agent keys check a payment before an AI agent can make it." },
  ];
  return (
    <Frame tone="dark">
      <Kicker tone="dark">Trust and safety</Kicker>
      <H>Read-only by design.</H>
      <Body>
      <div className="grid grid-cols-4 gap-6">
        {cards.map((c, i) => (
          <div key={c.title} className="pop flex flex-col rounded-card bg-ink-2 p-7 ring-1 ring-white/10" style={d(250 + i * 130)}>
            <span className="grid size-13 place-items-center rounded-2xl bg-signal/15 text-signal">
              <c.icon className="size-6" />
            </span>
            <p className="mt-7 text-[25px] leading-tight font-bold">{c.title}</p>
            <p className="mt-3 text-[17.5px] leading-relaxed text-white/65">{c.body}</p>
          </div>
        ))}
      </div>
      <p className="rise mt-10 max-w-[1100px] text-[18px] text-white/50" style={d(900)}>
        Honest by default: forgetting stops Sovra using a memory immediately. The encrypted copy on Walrus stays until its storage period ends, because the
        SDK has no delete, and the privacy policy says so.
      </p>
      </Body>
    </Frame>
  );
}

/* 8 ─ Live demo */
const DEMO: { title: string; body: string; shot: ScreenName; url: string }[] = [
  { title: "Sign in", body: "Any Sui wallet, or Slush on the web. One signed message, no transaction.", shot: "signin", url: "/signin" },
  { title: "Onboarding", body: "Four short steps, with a live panel of what Sovra will remember.", shot: "onboarding-3", url: "/onboarding" },
  { title: "Overview", body: "Bank statements plus USDC on Sui, read live through Tatum.", shot: "overview", url: "/app" },
  { title: "Learn from an edit", body: "Change one category, and Sovra offers to remember the rule.", shot: "transactions-learn", url: "/app/transactions" },
  { title: "Budgets that look ahead", body: "Renewals count before they land, shown hatched.", shot: "budgets", url: "/app/budgets" },
  { title: "Ask Sovra", body: "Answers from your numbers, with the memories they used.", shot: "ask", url: "/app/ask" },
  { title: "Memory page", body: "Everything in plain words. Filter, forget, undo.", shot: "memory", url: "/app/memory" },
  { title: "Private audit", body: "Duplicate charges and fees found inside a verified TEE.", shot: "audit", url: "/app/audit" },
];

function DemoSlide({ active }: SlideProps) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setStep((s) => Math.min(DEMO.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  const current = DEMO[step];
  return (
    <Frame className="pt-[80px]">
      <div className="flex items-end justify-between">
        <div>
          <Kicker>Live product demo</Kicker>
          <H className="text-[64px]">Let's show you.</H>
        </div>
        <a
          href={APP_URL}
          target="_blank"
          rel="noreferrer"
          className="rise flex items-center gap-2 rounded-xl bg-cobalt px-5 py-3 text-[18px] font-semibold text-white shadow-pop hover:bg-cobalt-deep"
          style={d(200)}
        >
          Open sovra.vercel.app <ArrowUpRight className="size-5" />
        </a>
      </div>
      <div className="mt-9 grid grid-cols-[360px_1fr] gap-8">
        <div className="flex flex-col">
          <p className="mb-3 text-[14px] font-semibold text-muted">Demo path · offline? click through, or use ↑ ↓</p>
          <ol className="space-y-1.5">
            {DEMO.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={cx(
                    "flex w-full gap-3.5 rounded-xl px-4 py-3 text-left transition-colors",
                    i === step ? "bg-card shadow-card ring-1 ring-line" : "hover:bg-card/60",
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[14px] font-bold",
                      i === step ? "bg-cobalt text-white" : i < step ? "bg-cobalt-soft text-cobalt" : "bg-track text-muted",
                    )}
                  >
                    {i < step ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span>
                    <span className={cx("block text-[18px] font-semibold", i !== step && "text-ink/70")}>{s.title}</span>
                    {i === step && <span className="mt-0.5 block text-[15px] leading-snug text-muted">{s.body}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-auto pt-4 text-[14px] text-muted">
            No wallet? Choose <b className="text-ink">Explore with a demo account</b> in the app.
          </p>
        </div>
        <div className="relative h-[560px]">
          <div key={step} className="h-full" style={{ animation: "fade-in 0.35s ease both" }}>
            <Shot name={current.shot} url={current.url} className="h-full w-full" />
          </div>
          <span className="absolute -top-3 right-5 rounded-full bg-ink px-3 py-1 text-[12.5px] font-semibold text-white">Demo account · real app</span>
        </div>
      </div>
    </Frame>
  );
}

/* 9 ─ Where we are */
function StatusSlide() {
  const built = [
    "Walrus Memory on mainnet: remember, recall, forget",
    "Live USDC on Sui through Tatum, with top-up watching",
    "Sui wallet sign-in with a signed challenge",
    "Statement import: CSV, Excel, Word, OFX/QIF, JSON, receipt photos",
    "Budgets with renewals and an AI cut plan",
    "Goals with savings forecasts from your statements",
    "Recurring bills with reminders and pause",
    "Ask Sovra with cited memories",
    "Private expense audit in a NEAR AI TEE",
    "Spending guard for AI agents",
  ];
  const tracks = [
    { name: "Consumer Finance Apps", note: "Track 03 · main entry", tone: "cobalt" as const },
    { name: "Best Walrus Memory", note: "Memory drives every screen", tone: "neutral" as const },
    { name: "Privacy & Private AI", note: "TEE expense auditor", tone: "neutral" as const },
    { name: "AI Security & Defense", note: "Spending guard", tone: "neutral" as const },
  ];
  return (
    <Frame>
      <Kicker>Where we are</Kicker>
      <H>Built, shipped, live on mainnet.</H>
      <Body>
      <div className="grid grid-cols-[1.35fr_1fr] gap-8">
        <Card className="pop p-8" style={d(200)}>
          <p className="text-[15px] font-semibold tracking-[0.12em] text-muted uppercase">Shipped</p>
          <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3.5">
            {built.map((b, i) => (
              <li key={b} className="rise flex gap-3 text-[17.5px] leading-snug" style={d(300 + i * 60)}>
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gain-soft text-gain">
                  <Check className="size-4" />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-6">
          <div className="pop rounded-card bg-ink p-7 text-white" style={d(400)}>
            <p className="text-[15px] font-semibold tracking-[0.12em] text-white/50 uppercase">Total Recall · Tatum x Walrus</p>
            <div className="mt-4 space-y-2.5">
              {tracks.map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-xl bg-white/6 px-4 py-3">
                  <span className="text-[18px] font-semibold">{t.name}</span>
                  <Chip tone={t.tone === "cobalt" ? "cobalt" : "dark"} className="text-[13px]">{t.note}</Chip>
                </div>
              ))}
            </div>
          </div>
          <Card className="pop p-7" style={d(550)}>
            <p className="text-[15px] font-semibold tracking-[0.12em] text-muted uppercase">Next</p>
            <ul className="mt-4 space-y-3 text-[17.5px]">
              <li className="flex gap-3"><CircleDashed className="mt-0.5 size-5 shrink-0 text-cobalt" /> x402 agent payments on Sui (feasibility done)</li>
              <li className="flex gap-3"><CircleDashed className="mt-0.5 size-5 shrink-0 text-cobalt" /> View switch: All · Bank · Sui wallet</li>
            </ul>
          </Card>
        </div>
      </div>
      </Body>
    </Frame>
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/* 11 ─ Close */
function CloseSlide() {
  return (
    <Frame className="flex flex-col items-center justify-center text-center">
      <div className="pop" style={d(0)}>
        <Logo className="size-24" />
      </div>
      <h2 className="rise mt-10 max-w-[1250px] text-[80px] leading-[1.04] font-bold tracking-[-0.04em]" style={d(120)}>
        Not just where your money goes.
        <br />
        <Remembered draw>What you're working toward.</Remembered>
      </h2>
      <p className="rise mt-8 text-[24px] text-muted" style={d(260)}>
        Persistent memory through Walrus. Onchain financial data through Tatum. Try it with a Sui wallet or a demo account.
      </p>
      <div className="rise mt-12 flex gap-4" style={d(380)}>
        <a href={APP_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-cobalt px-7 py-4 text-[20px] font-semibold text-white shadow-pop hover:bg-cobalt-deep">
          sovra.vercel.app <ArrowUpRight className="size-5" />
        </a>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-card px-7 py-4 text-[20px] font-semibold ring-1 ring-line hover:bg-white">
          <GithubMark className="size-5" /> Kingvic300/Sovra
        </a>
      </div>
      <p className="rise mt-14 flex items-center gap-2 text-[17px] text-muted" style={d(500)}>
        <BadgeCheck className="size-5 text-cobalt" /> Thank you · Victor and Ladipo, the team behind Sovra
      </p>
    </Frame>
  );
}


/* ── Slides that follow the 3-minute pitch, built from real app screenshots ── */

function Points({ items, tone = "light" }: { items: string[]; tone?: "light" | "dark" }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[19px] leading-snug">
          <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", tone === "dark" ? "bg-signal/20 text-signal" : "bg-cobalt-soft text-cobalt")}>
            <Check className="size-4" />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Text on the left, real screens on the right. */
function ShotSlide({ kicker, title, lead, points, children }: { kicker: string; title: ReactNode; lead: ReactNode; points?: string[]; children: ReactNode }) {
  return (
    <Frame className="pt-[84px]">
      <div className="grid h-full grid-cols-[470px_1fr] gap-12">
        <div className="flex flex-col justify-center">
          <Kicker>{kicker}</Kicker>
          <H className="text-[50px] leading-[1.06]">{title}</H>
          <Lead className="mt-6 text-[21px]">{lead}</Lead>
          {points && (
            <div className="rise mt-8" style={d(320)}>
              <Points items={points} />
            </div>
          )}
        </div>
        <div className="relative">{children}</div>
      </div>
    </Frame>
  );
}

function StartSlide() {
  return (
    <ShotSlide
      kicker="Getting started"
      title="One signature. Two goals."
      lead="Connect a Sui wallet, then tell Sovra what matters during onboarding."
      points={["Sign in by signing a message", "No transaction approval, ever", "Sovra never moves your funds"]}
    >
      <Shot name="signin" url="/signin" className="pop absolute top-[10px] right-0 h-[380px] w-[600px] rotate-[2deg]" style={d(200)} />
      <Shot name="onboarding-4" url="/onboarding" className="pop absolute top-[210px] left-0 h-[470px] w-[750px]" style={d(400)} />
      <div className="pop absolute right-[30px] bottom-[-14px] z-10 flex items-center gap-3 rounded-full bg-card py-2 pr-5 pl-2 shadow-pop ring-1 ring-line" style={d(800)}>
        <span className="grid size-9 place-items-center rounded-full bg-gain-soft text-gain">
          <KeyRound className="size-[18px]" />
        </span>
        <span className="text-[15px]">
          <b>Laptop, $1,200</b> <span className="text-muted">and</span> <b>entertainment under $100</b>
        </span>
      </div>
    </ShotSlide>
  );
}

function MemorySlide() {
  return (
    <ShotSlide
      kicker="Persistent memory · Walrus"
      title={
        <>
          Everything it <Remembered draw>remembers</Remembered>, in plain words.
        </>
      }
      lead="Review every memory, and stop Sovra using anything that's no longer relevant."
      points={["Stored on Walrus mainnet", "One namespace per user", "Nothing to repeat when you come back"]}
    >
      <Shot name="memory" url="/app/memory" className="pop absolute inset-x-0 top-[20px] h-[600px]" style={d(200)} />
      <Crop name="crop-onboarding-panel" className="pop absolute right-[-30px] bottom-[-30px] w-[250px] rotate-[2deg]" style={d(700)} />
    </ShotSlide>
  );
}

function TatumSlide() {
  return (
    <ShotSlide
      kicker="Onchain data · Tatum"
      title="Your goals, next to your real activity."
      lead="Through Tatum's Sui gateway, Sovra reads your USDC balance and onchain transfers into your transaction history."
    >
      <Shot name="overview" url="/app" className="pop absolute inset-x-0 top-[20px] h-[600px]" style={d(200)} />
      <Crop name="crop-accounts-wallet" className="pop absolute bottom-[10px] left-[30px] w-[380px] -rotate-[1.5deg]" style={d(650)} />
      <div className="pop absolute right-[-20px] bottom-[40px] z-10 w-[430px] rounded-[14px] bg-card p-2 shadow-pop ring-1 ring-line" style={d(900)}>
        {[
          ["25 Oct", "Upwork payout", "+$650.00"],
          ["23 Oct", "Tunde Bakare", "−$225.00"],
        ].map(([date, name, amt], i) => (
          <div key={name} className={cx("flex items-center gap-3 px-3 py-2.5 text-[15px]", i > 0 && "border-t border-line")}>
            <span className="w-[52px] text-muted">{date}</span>
            <span className="flex-1 font-medium whitespace-nowrap">{name}</span>
            <Chip tone="cobalt" className="text-[12px]">Sui wallet</Chip>
            <span className={cx("w-[78px] text-right font-semibold tabular-nums", amt.startsWith("+") && "text-gain")}>{amt}</span>
          </div>
        ))}
      </div>
      <div className="rise absolute -top-[46px] left-0 flex items-center gap-3 text-[16px] font-semibold" style={d(400)}>
        <Chip tone="cobalt" className="px-3.5 py-1.5 text-[15px]">
          <Brain className="size-4" /> Goals from Walrus
        </Chip>
        <span className="text-muted">+</span>
        <Chip tone="gain" className="px-3.5 py-1.5 text-[15px]">
          <Wallet className="size-4" /> Activity from Tatum
        </Chip>
      </div>
    </ShotSlide>
  );
}

function LearnSlide() {
  return (
    <ShotSlide
      kicker="How Sovra learns"
      title="Teach it once. It remembers."
      lead="An Amazon order filed as shopping was really business supplies. Fix it once, and Sovra asks to keep the rule for every future import."
      points={["Your edit becomes a memory", "Matching transactions are filed for you", "Marked “learned from your edit”"]}
    >
      <Shot name="transactions-learn" url="/app/transactions" className="pop absolute inset-x-0 top-[20px] h-[600px]" style={d(200)} />
      <Crop name="crop-tx-prompt" className="pop absolute top-[300px] right-[-50px] w-[860px] ring-2 ring-highlighter" style={d(700)} />
    </ShotSlide>
  );
}

function BudgetSlide() {
  return (
    <ShotSlide
      kicker="Budgets that look ahead"
      title="It sees the renewals coming."
      lead="Spotify and Netflix push entertainment to $111, over the $100 you set. Sovra flags it before the money leaves and suggests pausing Netflix."
      points={["Scheduled renewals shown hatched", "Protects the laptop goal", "Your choice becomes a memory too"]}
    >
      <Shot name="budgets" url="/app/budgets" className="pop absolute inset-x-0 top-[20px] h-[600px]" style={d(200)} />
      <Crop name="crop-overview-alert" className="pop absolute right-[-40px] bottom-[-30px] w-[520px] rotate-[1deg]" style={d(700)} />
    </ShotSlide>
  );
}

function AskSlide() {
  return (
    <ShotSlide
      kicker="Ask Sovra"
      title="Ask, and see why."
      lead="Answers use your real numbers plus the memories that matter, and show which memories they used."
      points={["Grounded in your budgets, goals and bills", "Lists the memories behind the answer", "No investment, tax or legal advice"]}
    >
      <Shot name="ask" url="/app/ask" className="pop absolute inset-x-0 top-[20px] h-[600px]" style={d(200)} />
      <Crop name="crop-ask-answer" className="pop absolute right-[-40px] bottom-[-34px] w-[560px]" style={d(700)} />
    </ShotSlide>
  );
}

/* Appendix: the rest of the app */
function GallerySlide() {
  const items: { shot: ScreenName; url: string; title: string; body: string }[] = [
    { shot: "goals", url: "/app/goals", title: "Goals", body: "Progress, weekly amounts and forecasts from your statements" },
    { shot: "recurring", url: "/app/recurring", title: "Recurring", body: "Bills and subscriptions, with reminders and pause" },
    { shot: "accounts", url: "/app/accounts", title: "Accounts", body: "Statement import and the Sui wallet, read through Tatum" },
    { shot: "audit", url: "/app/audit", title: "Private audit", body: "Receipts and statements checked inside a NEAR AI TEE" },
    { shot: "guard", url: "/app/guard", title: "Spending guard", body: "Policies, scam checks and keys for AI agents" },
    { shot: "overview-lower", url: "/app", title: "Overview", body: "Recent transactions and the laptop fund" },
  ];
  return (
    <Frame className="pt-[80px]">
      <Kicker>More of Sovra</Kicker>
      <H className="mt-4 text-[52px]">Everything else in the app.</H>
      <div className="mt-8 grid grid-cols-3 gap-x-7 gap-y-5">
        {items.map((it, i) => (
          <div key={it.title} className="pop" style={d(150 + i * 90)}>
            <Shot name={it.shot} url={it.url} className="h-[200px]" />
            <p className="mt-2.5 text-[17px] font-semibold">{it.title}</p>
            <p className="truncate text-[15px] text-muted">{it.body}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export const SLIDES: SlideDef[] = [
  {
    id: "title",
    title: "Sovra",
    tone: "light",
    Component: TitleSlide,
    notes: {
      time: "0:00–0:15",
      script:
        "Hey everyone! We're the team behind Sovra. I'm Victor, and together with my teammate Ladipo, we built Sovra for the Walrus and Tatum Total Recall Hackathon.\n\nSovra is a personal finance platform designed around one simple idea: your financial app should remember you.",
    },
  },
  {
    id: "problem",
    title: "The problem",
    tone: "dark",
    Component: ProblemSlide,
    notes: {
      time: "0:15–0:30",
      script:
        "Think about how most personal finance platforms work. You set a budget, correct a transaction, explain your spending habits, and set financial goals.\n\nBut when you come back, a lot of that context is gone. You end up repeating the same instructions and correcting the same mistakes.",
    },
  },
  {
    id: "solution",
    title: "Meet Sovra",
    tone: "light",
    Component: SolutionSlide,
    notes: {
      time: "0:30–0:35",
      script:
        "We thought there had to be a better way. That's why we built Sovra, a platform that remembers your financial goals, preferences, and decisions, and uses them to make its recommendations more personal.",
    },
  },
  {
    id: "start",
    title: "Getting started",
    tone: "light",
    Component: StartSlide,
    notes: {
      time: "0:35–0:55",
      script:
        "Let's walk through how it works.\n\nWe start by connecting a Sui wallet. Authentication only requires signing a message. No transaction approval is needed, and Sovra doesn't move users' funds.\n\nDuring onboarding, we set two preferences: a savings goal of twelve hundred dollars for a laptop, and an entertainment budget of less than a hundred dollars per month.\n\nSovra captures these preferences because they'll be important throughout the experience.",
    },
  },
  {
    id: "memory",
    title: "Memory on Walrus",
    tone: "light",
    Component: MemorySlide,
    notes: {
      time: "0:55–1:15",
      script:
        "Here's where things get interesting.\n\nThis is Sovra's Memory page. We can see everything the platform remembers about the user, in plain language.\n\nUsers can review their memories and stop Sovra from using information that is no longer relevant.\n\nWe're using Walrus to store these memories persistently, so users don't have to start from scratch every time they return.\n\nThe idea is simple: your financial context should stay with you.",
    },
  },
  {
    id: "tatum",
    title: "Onchain data with Tatum",
    tone: "light",
    Component: TatumSlide,
    notes: {
      time: "1:15–1:35",
      script:
        "But remembering financial goals is only one part of the equation. Sovra also needs to understand what's actually happening with your finances.\n\nThrough Tatum's Sui gateway, we retrieve the user's USDC balance and onchain transfers, bringing that activity directly into Sovra's transaction history.\n\nNow we have two important things working together: the user's financial goals and their actual financial activity.",
    },
  },
  {
    id: "learn",
    title: "How Sovra learns",
    tone: "light",
    Component: LearnSlide,
    notes: {
      time: "1:35–2:00",
      script:
        "Let's look at a practical example.\n\nHere, we have an Amazon transaction categorized as shopping. But let's say this purchase was actually for business supplies.\n\nWe change the category, and Sovra asks whether future Amazon purchases should also be categorized as business supplies.\n\nWe confirm, and that preference is saved as a new memory.\n\nThe next time a matching transaction comes in, Sovra can apply that preference automatically.\n\nInstead of correcting the same mistake over and over, users teach Sovra once, and it remembers.",
    },
  },
  {
    id: "budgets",
    title: "Budgets that look ahead",
    tone: "light",
    Component: BudgetSlide,
    notes: {
      time: "2:00–2:25",
      script:
        "Now, let's look at budgeting.\n\nWe've set our entertainment limit at a hundred dollars. But Spotify and Netflix are both due to renew this month.\n\nTogether, they'll push our entertainment spending to a hundred and eleven dollars, exceeding the budget.\n\nSovra identifies this before the expenses hit and suggests pausing Netflix to help us stay within our limit and protect our laptop savings goal.\n\nSo rather than simply showing users where their money went, Sovra helps them think ahead.",
    },
  },
  {
    id: "ask",
    title: "Ask Sovra",
    tone: "light",
    Component: AskSlide,
    notes: {
      time: "2:25–2:45",
      script:
        "And sometimes, we don't want to navigate through different pages. We just want to ask a question.\n\nFor example: 'Can I afford a sixty-dollar concert this weekend?'\n\nSovra considers our actual financial data alongside relevant saved memories to generate a recommendation.\n\nIt also shows which memories informed its response, so users can understand the context behind the advice.",
    },
  },
  {
    id: "close",
    title: "Thank you",
    tone: "light",
    Component: CloseSlide,
    notes: {
      time: "2:45–3:00",
      script:
        "And that's Sovra.\n\nWe've brought together persistent memory through Walrus and onchain financial data through Tatum to create a personal finance platform that remembers more than just transactions.\n\nBecause personal finance isn't just about knowing where your money goes. It's about understanding what you're working toward.\n\nWe're the team behind Sovra. Thank you!",
    },
  },
  // Appendix: for questions after the pitch.
  { id: "gallery", title: "Appendix · More of Sovra", tone: "light", Component: GallerySlide, appendix: true },
  { id: "example", title: "Appendix · Worked example", tone: "light", Component: ExampleSlide, appendix: true },
  { id: "loop", title: "Appendix · The learning loop", tone: "light", Component: LoopSlide, appendix: true },
  { id: "stack", title: "Appendix · Walrus, Tatum and Sui", tone: "light", Component: StackSlide, appendix: true },
  { id: "trust", title: "Appendix · Trust and safety", tone: "dark", Component: TrustSlide, appendix: true },
  { id: "demo", title: "Appendix · Backup demo", tone: "light", Component: DemoSlide, appendix: true },
  { id: "status", title: "Appendix · Where we are", tone: "light", Component: StatusSlide, appendix: true },
];

/** Total length of the pitch, for the presenter timer. */
export const PITCH_SECONDS = 180;

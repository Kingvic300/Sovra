import {
  ArrowLeftRight,
  BadgeCheck,
  Brain,
  ChartPie,
  Check,
  FileSearch,
  LayoutDashboard,
  MessageSquareText,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  Undo2,
  Wallet,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Bar, Chip, cx, d, Logo, MemoryText, money, Remembered } from "./ui";

type NavId = "overview" | "transactions" | "budgets" | "goals" | "recurring" | "memory" | "ask" | "accounts" | "audit" | "guard";

const NAV: { id: NavId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "budgets", label: "Budgets", icon: ChartPie },
  { id: "goals", label: "Goals", icon: Target },
  { id: "recurring", label: "Recurring", icon: Repeat },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "ask", label: "Ask Sovra", icon: MessageSquareText },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "audit", label: "Private audit", icon: FileSearch },
  { id: "guard", label: "Spending guard", icon: ShieldCheck },
];

/** A small, static replica of the Sovra app shell. */
export function AppFrame({ active, title, children, bare = false }: { active?: NavId; title: string; children: ReactNode; bare?: boolean }) {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-[20px] bg-porcelain shadow-pop ring-1 ring-black/10">
      {!bare && (
        <aside className="flex w-[210px] shrink-0 flex-col gap-1 border-r border-line bg-card px-3 py-4">
          <div className="mb-3 flex items-center gap-2 px-2">
            <Logo className="size-7" />
            <span className="text-[17px] font-bold">Sovra</span>
          </div>
          {NAV.map((item) => (
            <div
              key={item.id}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[14px] font-medium",
                item.id === active ? "bg-cobalt-soft text-cobalt" : "text-muted",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </div>
          ))}
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-card/70 px-6">
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <span className="size-2 rounded-full bg-gain" /> Walrus Memory · mainnet
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">{children}</div>
      </div>
    </div>
  );
}

function Panel({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <div className={cx("pop rounded-[14px] bg-card p-4 shadow-card ring-1 ring-line", className)} style={d(delay)}>
      {children}
    </div>
  );
}

const MEMORIES = [
  { kind: "Goal", text: "You're saving for a laptop, $1,200 by January.", highlight: "laptop, $1,200 by January", source: "You told Sovra", uses: 9 },
  { kind: "Limit", text: "Keep entertainment under $100 a month.", highlight: "under $100 a month", source: "You told Sovra", uses: 6 },
  { kind: "Correction", text: "Amazon orders are business supplies, not shopping.", highlight: "business supplies", source: "You edited a transaction", uses: 4 },
  { kind: "Preference", text: "You're paid on the 25th, so a low balance the week before is normal.", highlight: "paid on the 25th", source: "You dismissed an alert", uses: 3 },
  { kind: "Decision", text: "You kept Spotify and paused Disney+ in October.", highlight: "paused Disney+", source: "You chose in a review", uses: 2 },
];

export function OnboardingScreen() {
  return (
    <AppFrame title="Welcome to Sovra · step 3 of 4" bare>
      <div className="grid h-full grid-cols-[1.1fr_1fr] gap-6">
        <Panel className="flex flex-col gap-4 p-6">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx("h-1.5 flex-1 rounded-full", i <= 2 ? "bg-cobalt" : "bg-track")} />
            ))}
          </div>
          <p className="text-[24px] font-bold leading-tight">What are you saving for?</p>
          <Field label="Goal" value="Laptop" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target" value="$1,200" />
            <Field label="By" value="31 Jan 2027" />
          </div>
          <Field label="When are you paid?" value="The 25th of each month" />
          <span className="mt-auto w-fit rounded-lg bg-cobalt px-4 py-2 text-[14px] font-semibold text-white">Continue</span>
        </Panel>
        <Panel delay={150} className="flex flex-col gap-3 bg-ink p-6 text-white ring-0">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-signal">
            <Sparkles className="size-4" /> What Sovra will remember
          </p>
          {[
            ["Your name is", "Ada"],
            ["Money comes from", "a bank CSV and a Sui wallet"],
            ["Saving for a", "laptop, $1,200 by January"],
            ["You're", "paid on the 25th"],
          ].map(([a, b], i) => (
            <p key={a} className="rise rounded-lg bg-white/8 px-3 py-2.5 text-[15px]" style={d(300 + i * 140)}>
              {a} <Remembered>{b}</Remembered>
            </p>
          ))}
        </Panel>
      </div>
    </AppFrame>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-muted">{label}</p>
      <p className="rounded-lg border border-[#7f8ba0] bg-card px-3 py-2 text-[15px]">{value}</p>
    </div>
  );
}

export function OverviewScreen() {
  return (
    <AppFrame active="overview" title="Good morning, Ada">
      <div className="grid h-full grid-cols-3 grid-rows-[auto_1fr] gap-4">
        <Panel className="col-span-2">
          <p className="text-[13px] font-semibold text-muted">Total balance</p>
          <p className="text-[38px] font-bold tabular-nums tracking-tight">{money(4218.4)}</p>
          <div className="mt-1 flex gap-2 text-[13px]">
            <Chip>Bank CSV {money(3186)}</Chip>
            <Chip tone="cobalt">
              <Wallet className="size-3.5" /> USDC on Sui {money(1032.4)} · live via Tatum
            </Chip>
          </div>
          <svg viewBox="0 0 400 70" className="mt-3 h-[70px] w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="ov" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#2340D0" stopOpacity="0.22" />
                <stop offset="1" stopColor="#2340D0" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 52 L40 48 L80 50 L120 40 L160 44 L200 30 L240 34 L280 22 L320 28 L360 16 L400 12 L400 70 L0 70Z" fill="url(#ov)" />
            <path d="M0 52 L40 48 L80 50 L120 40 L160 44 L200 30 L240 34 L280 22 L320 28 L360 16 L400 12" fill="none" stroke="#2340D0" strokeWidth="2.5" />
          </svg>
        </Panel>
        <Panel delay={100} className="row-span-2 flex flex-col gap-2.5">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Brain className="size-4 text-cobalt" /> What Sovra remembers
          </p>
          {MEMORIES.slice(0, 4).map((m) => (
            <p key={m.text} className="rounded-lg bg-porcelain px-3 py-2 text-[13.5px] leading-snug">
              <MemoryText text={m.text} highlight={m.highlight} />
            </p>
          ))}
        </Panel>
        <Panel delay={200} className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold">Budgets this month</p>
          <BudgetRow name="Entertainment" spent={82} limit={100} pending={29} />
          <BudgetRow name="Food" spent={214} limit={320} />
          <BudgetRow name="Transport" spent={121} limit={150} />
        </Panel>
        <Panel delay={300} className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold">Laptop fund</p>
          <p className="text-[26px] font-bold tabular-nums">
            {money(740, false)} <span className="text-[15px] font-medium text-muted">of {money(1200, false)}</span>
          </p>
          <Bar value={740} max={1200} tone="gain" />
          <p className="text-[13px] text-gain">On track for 31 January at $40 a week</p>
        </Panel>
      </div>
    </AppFrame>
  );
}

function BudgetRow({ name, spent, limit, pending = 0 }: { name: string; spent: number; limit: number; pending?: number }) {
  const over = spent + pending > limit;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="font-medium">{name}</span>
        <span className={cx("tabular-nums", over ? "font-semibold text-over" : "text-muted")}>
          {money(spent + pending, false)} / {money(limit, false)}
        </span>
      </div>
      <Bar value={spent} max={limit} pending={pending} tone={over ? "over" : spent / limit > 0.8 ? "caution" : "cobalt"} className="h-2" />
    </div>
  );
}

export function TransactionsScreen() {
  const rows = [
    ["27 Oct", "Shoprite", "Food and groceries", -38.2],
    ["26 Oct", "Amazon", "Business supplies", -46.0],
    ["25 Oct", "Upwork payout", "Income", 650.0],
    ["25 Oct", "Bolt", "Transport", -6.2],
    ["24 Oct", "Spotify", "Entertainment", -10.99],
    ["23 Oct", "Tunde Bakare", "Rent share", -225.0],
  ] as const;
  return (
    <AppFrame active="transactions" title="Transactions">
      <div className="relative h-full">
        <Panel className="p-0">
          {rows.map(([date, merchant, cat, amt], i) => (
            <div key={merchant + date} className={cx("grid grid-cols-[80px_1fr_190px_110px] items-center px-5 py-3 text-[14px]", i > 0 && "border-t border-line", merchant === "Amazon" && "bg-cobalt-soft/60")}>
              <span className="text-muted">{date}</span>
              <span className="font-medium">{merchant}</span>
              <span>
                <Chip tone={merchant === "Amazon" ? "cobalt" : "neutral"} className="text-[12.5px]">
                  {cat}
                </Chip>
              </span>
              <span className={cx("text-right tabular-nums font-semibold", amt > 0 && "text-gain")}>{amt > 0 ? "+" : ""}{money(amt)}</span>
            </div>
          ))}
        </Panel>
        <div className="pop absolute right-4 bottom-2 w-[400px] rounded-[14px] border-2 border-highlighter bg-[#fffbe6] p-5 shadow-pop" style={d(350)}>
          <p className="text-[16px] leading-snug">
            Always file <b>Amazon</b> under <Remembered>business supplies</Remembered>?
          </p>
          <p className="mt-1 text-[13px] text-muted">Sovra will sort future Amazon orders this way and use it in budgets.</p>
          <div className="mt-3 flex gap-2">
            <span className="rounded-lg bg-cobalt px-3.5 py-1.5 text-[13.5px] font-semibold text-white">Remember this</span>
            <span className="rounded-lg bg-card px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-line">Just this once</span>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

export function BudgetsScreen() {
  return (
    <AppFrame active="budgets" title="Budgets · October">
      <div className="grid h-full grid-cols-[1.15fr_1fr] gap-4">
        <Panel className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-[16px] font-semibold">Entertainment</p>
            <Chip tone="over">Heading $11 over</Chip>
          </div>
          <Bar value={82} max={100} pending={29} tone="over" className="h-4" />
          <div className="flex gap-5 text-[13px] text-muted">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-over" /> Spent {money(82, false)}</span>
            <span className="flex items-center gap-1.5"><span className="hatch-over size-3 rounded-sm" /> Renewing before month end {money(28.98)}</span>
          </div>
          <div className="rounded-lg bg-porcelain p-3 text-[14px]">
            Your limit: <Remembered>under $100 a month</Remembered>
          </div>
          <div className="space-y-2 text-[14px]">
            <Line label="Spotify renews 30 Oct" value={money(10.99)} />
            <Line label="Netflix renews Fri 31 Oct" value={money(17.99)} />
          </div>
          <span className="mt-auto flex w-fit items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[14px] font-semibold text-white">
            <Sparkles className="size-4 text-highlighter" /> What should I cut?
          </span>
        </Panel>
        <Panel delay={250} className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles className="size-4 text-cobalt" /> Sovra's plan
          </p>
          <div className="rounded-lg bg-gain-soft p-3 text-[14px]">
            <b>Pause Netflix</b> this month. Saves {money(17.99)} and keeps you under your limit.
          </div>
          <div className="rounded-lg bg-porcelain p-3 text-[14px]">
            <b>Keep Spotify.</b> You kept it in October, so Sovra leaves it alone.
          </div>
          <p className="text-[13px] text-muted">Used: <Remembered>paused Disney+</Remembered> · <Remembered>laptop, $1,200 by January</Remembered></p>
          <div className="mt-auto flex gap-2">
            <span className="rounded-lg bg-cobalt px-3.5 py-1.5 text-[13.5px] font-semibold text-white">Pause Netflix</span>
            <span className="rounded-lg bg-card px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-line">Keep it</span>
          </div>
        </Panel>
      </div>
    </AppFrame>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-dashed border-line pb-2">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function AskScreen() {
  return (
    <AppFrame active="ask" title="Ask Sovra">
      <div className="mx-auto flex h-full max-w-[680px] flex-col gap-4">
        <p className="rise ml-auto w-fit rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-white">Can I afford a $300 phone this month?</p>
        <div className="pop flex gap-3" style={d(250)}>
          <Logo className="size-8 shrink-0" />
          <div className="rounded-2xl rounded-tl-md bg-card p-4 text-[15px] leading-relaxed shadow-card ring-1 ring-line">
            Not without slowing the laptop fund. After rent on 1 November and your renewals, you have about <b>$612 free</b> until you're paid on the 25th. A
            $300 phone leaves $312, and the laptop target slips to late February. If the phone can wait until after the 25th, both fit.
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-[12.5px] font-semibold tracking-wide text-muted uppercase">Used 3 memories</p>
              <div className="flex flex-wrap gap-1.5 text-[13px]">
                <Remembered>laptop, $1,200 by January</Remembered>
                <Remembered>paid on the 25th</Remembered>
                <Remembered>rent share</Remembered>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

export function MemoryScreen() {
  return (
    <AppFrame active="memory" title="Memory · 7 things Sovra remembers">
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex gap-2 text-[13px]">
          {["All", "Goals", "Limits", "Corrections", "Preferences", "Decisions"].map((f, i) => (
            <Chip key={f} tone={i === 0 ? "cobalt" : "neutral"}>{f}</Chip>
          ))}
        </div>
        {MEMORIES.map((m, i) => (
          <Panel key={m.text} delay={i * 80} className="flex items-center gap-4 py-3">
            <Chip className="w-[108px] justify-center text-[12.5px]">{m.kind}</Chip>
            <p className="flex-1 text-[14.5px]">
              <MemoryText text={m.text} highlight={m.highlight} />
            </p>
            <span className="text-[12.5px] text-muted">{m.source} · used {m.uses}×</span>
            <span className="text-[13px] font-semibold text-over">Forget</span>
          </Panel>
        ))}
        <div className="pop mt-auto flex w-fit items-center gap-3 self-center rounded-full bg-ink py-2 pr-2 pl-4 text-[13.5px] text-white" style={d(600)}>
          Sovra forgot "Bolt rides after 10 pm are for safety"
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-semibold"><Undo2 className="size-3.5" /> Undo</span>
        </div>
      </div>
    </AppFrame>
  );
}

export function AuditScreen() {
  const checks = ["Report echoes our nonce", "Intel TDX quote verifies, TCB UpToDate", "TD not in debug mode", "NVIDIA GPU attestation passes", "Signature covers our exact request and response", "Signer is the attested model key"];
  return (
    <AppFrame active="audit" title="Private audit · NEAR AI Cloud">
      <div className="grid h-full grid-cols-[1.1fr_1fr] gap-4">
        <Panel className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold">Found in northwind-checking-oct-2026.csv</p>
          {[
            ["over", "Pixelport charged twice", "129.99 twice on 13 Oct"],
            ["caution", "Ride 4× your usual price", "CityGo, 61.90 vs about 14"],
            ["caution", "Streaming price went up", "StreamFlix, 12.99 to 15.99"],
            ["neutral", "Fees this month", "Maintenance 12.00, overdraft 25.00, foreign 3.90"],
          ].map(([tone, a, b], i) => (
            <div key={a} className="rise flex items-start gap-3 rounded-lg bg-porcelain p-3" style={d(150 + i * 110)}>
              <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", tone === "over" ? "bg-over" : tone === "caution" ? "bg-caution" : "bg-muted")} />
              <div>
                <p className="text-[14.5px] font-semibold">{a}</p>
                <p className="text-[13px] text-muted">{b}</p>
              </div>
            </div>
          ))}
        </Panel>
        <Panel delay={200} className="flex flex-col gap-2.5 bg-ink text-white ring-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <BadgeCheck className="size-5 text-[#3ddc97]" /> Verified inside a TEE
          </p>
          {checks.map((c, i) => (
            <p key={c} className="rise flex items-center gap-2.5 text-[13.5px] text-white/85" style={d(400 + i * 90)}>
              <Check className="size-4 shrink-0 text-[#3ddc97]" /> {c}
            </p>
          ))}
          <p className="mt-auto text-[12.5px] text-white/55">Nothing is stored. Upload buffers are zeroed before the response returns.</p>
        </Panel>
      </div>
    </AppFrame>
  );
}

import { Link } from "react-router";
import { ArrowLeftRight, ChartPie, KeyRound, MessageSquareText, Repeat, ShieldCheck, Target, Wallet } from "lucide-react";
import { CtaBand, MemoryCard, Section } from "@/components/marketing/blocks";
import { Logo } from "@/components/shell/logo";
import { buttonClass } from "@/components/ui/button-class";
import { Progress } from "@/components/ui/progress";
import { Remembered } from "@/components/ui/remembered";
import { useTitle } from "@/lib/use-title";

const HERO_MEMORIES = [
  { text: "You're saving for a laptop, $1,200 by January.", highlight: "laptop, $1,200 by January" },
  { text: "Keep entertainment under $100 a month.", highlight: "under $100 a month" },
  { text: "You're paid on the 25th.", highlight: "paid on the 25th" },
];

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:mx-0 lg:ml-auto">
      <MemoryCard items={HERO_MEMORIES} className="relative z-10 w-[88%]" />

      <div className="relative z-20 -mt-6 ml-auto w-[86%] rounded-card bg-card p-5 shadow-pop ring-1 ring-line">
        <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-ink px-4 py-2 text-[15px] text-white">
          Can I afford a $300 phone this month?
        </p>
        <div className="mt-4 flex gap-3">
          <Logo variant="tile" className="size-8 shrink-0" />
          <p className="text-[15px] leading-relaxed">
            Not without slowing your laptop fund. You have about $612 free until you're paid on the 25th. Wait until
            after payday and both fit.
          </p>
        </div>
      </div>

      <div className="relative z-30 -mt-4 ml-[6%] flex w-fit items-center gap-3 rounded-full bg-card py-2 pr-4 pl-2 shadow-pop ring-1 ring-line">
        <span className="grid size-8 place-items-center rounded-full bg-cobalt-soft text-cobalt">
          <Wallet className="size-4" aria-hidden />
        </span>
        <span className="text-[14px]">
          <span className="font-semibold tabular-nums">$1,032.40 USDC</span>{" "}
          <span className="text-muted">live via Tatum</span>
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Tell it once",
    body: "Set a goal, fix a category, explain a big expense. Say it in plain words or tap a button.",
    visual: (
      <div className="rounded-xl border border-highlighter bg-[#fffbe6] p-4 text-[14px]">
        Always file <span className="font-semibold">Amazon</span> under <mark className="remembered">business supplies</mark>?
        <div className="mt-3 flex gap-2">
          <span className={buttonClass("primary", "sm")}>Remember this</span>
          <span className={buttonClass("secondary", "sm")}>Just this once</span>
        </div>
      </div>
    ),
  },
  {
    title: "Sovra remembers",
    body: "Each fact is saved, encrypted, to your Walrus vault. It follows you across sessions and devices, and you can forget any of it.",
    visual: (
      <ul className="flex flex-col gap-2 rounded-xl bg-porcelain p-4 text-[14px]">
        <li>
          <Remembered text="Amazon orders are business supplies." highlight="business supplies" />
        </li>
        <li>
          <Remembered text="Bolt rides after 10 pm are for safety." highlight="for safety" />
        </li>
      </ul>
    ),
  },
  {
    title: "Advice that fits",
    body: "Budgets, reminders and answers use what you told it. No more explaining yourself every month.",
    visual: (
      <div className="rounded-xl bg-porcelain p-4 text-[14px]">
        <div className="flex justify-between font-medium">
          <span>Entertainment</span>
          <span className="tabular-nums">$82 of $100</span>
        </div>
        <div className="mt-2">
          <Progress value={82} max={100} committed={29} tone="caution" label="Entertainment budget" />
        </div>
        <p className="mt-2 text-over">Netflix renews Friday and puts you $11 over. Pause it?</p>
      </div>
    ),
  },
];

const FEATURES = [
  { icon: ChartPie, title: "Budgets that count renewals", body: "Scheduled bills are subtracted before Sovra says you have room." },
  { icon: Target, title: "Goals that guard themselves", body: "Every spending question is checked against what you're saving for." },
  { icon: Repeat, title: "Renewals, remembered", body: "Reminders before each charge, with what you decided last time." },
  { icon: ArrowLeftRight, title: "Categories that learn", body: "Correct a merchant once and every future import follows." },
  { icon: MessageSquareText, title: "Ask in plain words", body: "\"Why am I spending more?\" gets an answer from your real numbers." },
  { icon: Wallet, title: "Bank and USDC together", body: "Import statements and see USDC on Sui in one balance." },
];

const STACK = [
  {
    icon: KeyRound,
    name: "Sui zkLogin",
    body: "Sign in with Google and get a Sui address. No seed phrase, no extension, no password to remember.",
  },
  {
    icon: ShieldCheck,
    name: "Walrus Memory",
    body: "Your goals and decisions are stored encrypted on Walrus mainnet, so the memory is yours, not locked in one app.",
  },
  {
    icon: Wallet,
    name: "Tatum",
    body: "Live USDC balances and transfers read from Sui through Tatum's RPC. Read only, always.",
  },
];

export default function HomePage() {
  useTitle();
  return (
    <>
      <Section className="!pt-12 lg:!pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="max-w-[14ch] text-[48px] leading-[0.98] font-extrabold tracking-[-0.04em] sm:text-[68px] xl:text-[80px]">
              Money help that remembers you.
            </h1>
            <p className="mt-6 max-w-[48ch] text-[19px] leading-relaxed text-muted">
              Sovra reads your accounts, learns your goals, limits and habits, and keeps them in a vault you own. Ask
              anything and get an answer that fits your life, not an average.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/signup" className={`${buttonClass()} h-12 px-6 text-[15px]`}>
                Get started with Google
              </Link>
              <Link to="/signin" className={`${buttonClass("secondary")} h-12 px-6 text-[15px]`}>
                Try the demo
              </Link>
            </div>
            <p className="mt-5 text-[14px] text-muted">No seed phrase. No bank password. Sovra never moves your money.</p>
          </div>
          <HeroVisual />
        </div>
      </Section>

      <Section className="bg-card">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <h2 className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[44px]">
            Most money apps forget you the moment you close them.
          </h2>
          <p className="self-end text-[18px] leading-relaxed text-muted">
            You set a budget, explain a big month, correct the same merchant again, and next time it starts from zero.
            Sovra keeps that context and uses it, so advice gets more personal every week instead of resetting every
            login.
          </p>
        </div>
      </Section>

      <Section id="how">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]">How Sovra learns</h2>
          <Link to="/how-it-works" className="font-semibold text-cobalt hover:underline">
            See the full walkthrough
          </Link>
        </div>
        <ol className="mt-10 grid gap-6 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-card bg-card p-6 shadow-card">
              <span className="grid size-9 place-items-center rounded-full bg-ink text-[15px] font-bold text-white">{i + 1}</span>
              <h3 className="mt-5 text-[21px] font-bold tracking-[-0.015em]">{s.title}</h3>
              <p className="mt-2 mb-6 text-muted">{s.body}</p>
              <div className="mt-auto">{s.visual}</div>
            </li>
          ))}
        </ol>
      </Section>

      <Section className="!pt-0">
        <h2 className="text-[28px] font-extrabold tracking-[-0.025em]">Everything a money app should do, with memory</h2>
        <ul className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-4 border-t border-line pt-5">
              <f.icon className="mt-0.5 size-5 shrink-0 text-cobalt" aria-hidden />
              <div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-1 text-muted">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="bg-card">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[44px]">
              Built on infrastructure you can check
            </h2>
            <p className="mt-4 max-w-[46ch] text-[17px] text-muted">
              You don't need to know anything about crypto to use Sovra. If you do, here's what's underneath.
            </p>
            <Link to="/security" className={`${buttonClass("secondary")} mt-6`}>
              How Sovra keeps you safe
            </Link>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-card bg-line">
            {STACK.map((s) => (
              <li key={s.name} className="flex gap-5 bg-porcelain p-6">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-cobalt shadow-card">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[18px] font-bold">{s.name}</h3>
                  <p className="mt-1 text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

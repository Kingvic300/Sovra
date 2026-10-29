import type { ReactNode } from "react";
import { Building2, Check, FileSpreadsheet, KeyRound, MessageSquareText, Wallet } from "lucide-react";
import { CtaBand, MemoryCard, PageIntro, Section } from "@/components/marketing/blocks";
import { Logo } from "@/components/shell/logo";
import { Progress } from "@/components/ui/progress";
import { useTitle } from "@/lib/use-title";

function Step({ n, title, children, visual }: { n: number; title: string; children: ReactNode; visual: ReactNode }) {
  return (
    <li className="grid gap-8 border-t border-line py-12 first:border-t-0 first:pt-0 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div>
        <span className="grid size-10 place-items-center rounded-full bg-ink text-[16px] font-bold text-white">{n}</span>
        <h2 className="mt-5 text-[30px] leading-tight font-extrabold tracking-[-0.025em]">{title}</h2>
        <div className="mt-3 flex max-w-[56ch] flex-col gap-3 text-[17px] leading-relaxed text-muted">{children}</div>
      </div>
      <div className="self-center">{visual}</div>
    </li>
  );
}

export default function HowItWorksPage() {
  useTitle("How it works");
  return (
    <>
      <PageIntro title="From sign-in to advice that fits, in five steps">
        Sovra takes about three minutes to set up. Everything after that gets better the more you use it.
      </PageIntro>

      <Section className="!pt-4">
        <ol>
          <Step
            n={1}
            title="Connect your Sui wallet"
            visual={
              <div className="rounded-card bg-card p-6 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
                    <KeyRound className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold">Wallet connected</p>
                    <p className="text-[14px] text-muted tabular-nums">0x7b3e…2f9a</p>
                  </div>
                </div>
                <p className="mt-4 text-[14px] text-muted">Signed one message to prove it's yours. Sovra can only read it.</p>
              </div>
            }
          >
            <p>
              Connect Slush or any Sui wallet and sign one message. That signature proves the address is yours, so
              Sovra can read your USDC. It never asks for a transaction and can never move money.
            </p>
          </Step>

          <Step
            n={2}
            title="Add where your money lives"
            visual={
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-card bg-card p-5 shadow-card">
                  <FileSpreadsheet className="size-5 text-cobalt" aria-hidden />
                  <p className="mt-3 font-semibold">Bank statement</p>
                  <p className="text-[14px] text-muted">Upload a CSV from any bank.</p>
                </div>
                <div className="rounded-card bg-card p-5 shadow-card">
                  <Wallet className="size-5 text-cobalt" aria-hidden />
                  <p className="mt-3 font-semibold">USDC on Sui</p>
                  <p className="text-[14px] text-muted">Read live through Tatum.</p>
                </div>
              </div>
            }
          >
            <p>
              Import statements from your bank as CSV. Sovra matches the columns, categorizes each transaction and spots
              recurring bills.
            </p>
            <p>If you hold USDC, Sovra reads it straight from your Sui address. It only ever reads; it can't move money.</p>
          </Step>

          <Step
            n={3}
            title="Top up with USDC when you want to"
            visual={
              <div className="rounded-card bg-card p-6 shadow-card">
                <p className="font-semibold">Top up your Sui wallet</p>
                <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
                  <li className="flex items-center gap-3 rounded-lg border border-line p-3">
                    <Building2 className="size-4 text-cobalt" aria-hidden /> From an exchange, choosing Sui as the network
                  </li>
                  <li className="flex items-center gap-3 rounded-lg border border-line p-3">
                    <Wallet className="size-4 text-cobalt" aria-hidden /> From another Sui wallet
                  </li>
                </ul>
                <p className="mt-4 flex items-center gap-2 text-[14px] text-gain">
                  <Check className="size-4" aria-hidden /> Sovra spots the deposit within seconds
                </p>
              </div>
            }
          >
            <p>
              Sovra never holds your money. To add USDC, you send it to your own Sui address from an exchange or another
              wallet. The top-up screen shows the address and a QR code, and tells you when the deposit lands.
            </p>
          </Step>

          <Step
            n={4}
            title="Tell Sovra what matters"
            visual={
              <MemoryCard
                items={[
                  { text: "You're saving for a laptop, $1,200 by January.", highlight: "laptop, $1,200 by January" },
                  { text: "Keep entertainment under $100 a month.", highlight: "under $100 a month" },
                  { text: "Transfers to Tunde are your rent share.", highlight: "rent share" },
                ]}
              />
            }
          >
            <p>
              Set a goal and a limit during setup. After that, every correction, dismissed alert and decision becomes a
              memory, written in plain words and highlighted so you can see exactly what Sovra knows.
            </p>
            <p>Memories are stored encrypted on Walrus. Open the Memory page to review or forget any of them.</p>
          </Step>

          <Step
            n={5}
            title="Ask, plan and get reminded"
            visual={
              <div className="rounded-card bg-card p-6 shadow-card">
                <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-ink px-4 py-2 text-[15px] text-white">
                  Why am I spending more than usual?
                </p>
                <div className="mt-4 flex gap-3">
                  <Logo variant="tile" className="size-8 shrink-0" />
                  <p className="text-[15px] leading-relaxed">
                    Transport is up $46, mostly late Bolt rides. You told me those are for safety, so I'd raise the
                    limit to $170 rather than cut them.
                  </p>
                </div>
                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex justify-between text-[14px] font-medium">
                    <span>Transport</span>
                    <span className="tabular-nums">$121 of $150</span>
                  </div>
                  <div className="mt-2">
                    <Progress value={121} max={150} tone="caution" label="Transport budget" />
                  </div>
                </div>
              </div>
            }
          >
            <p>
              Ask questions in plain words. Budgets count renewals before they hit, goals are checked before big
              purchases, and reminders arrive before each charge with what you decided last time.
            </p>
            <p className="flex items-center gap-2 text-ink">
              <MessageSquareText className="size-4 text-cobalt" aria-hidden />
              The answers use your numbers and your memories, not averages.
            </p>
          </Step>
        </ol>
      </Section>

      <CtaBand />
    </>
  );
}

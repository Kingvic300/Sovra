import { Link } from "react-router";
import { EyeOff, KeyRound, Lock, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { CtaBand, PageIntro, Section } from "@/components/marketing/blocks";
import { useTitle } from "@/lib/use-title";

const PILLARS = [
  {
    icon: KeyRound,
    title: "Sign in without a seed phrase",
    points: [
      "Sovra uses Sui zkLogin through Enoki by Mysten Labs. Your Google sign-in proves who you are, and a zero-knowledge proof links it to your Sui address.",
      "Sovra never sees your Google password.",
      "Your address is tied to your Google account. Keep that account secure, because losing access to it can mean losing access to the address.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Read only, always",
    points: [
      "Sovra reads bank statements you upload and USDC on your Sui address. It never asks for bank passwords.",
      "It can't move, spend or hold your money. The top-up screen only shows your own deposit address.",
    ],
  },
  {
    icon: Lock,
    title: "Memories are encrypted on Walrus",
    points: [
      "Goals, limits, corrections and decisions are stored with Walrus Memory on the Walrus network.",
      "A relayer turns each memory into a searchable form, encrypts it and stores it. The relayer handles the text to do that.",
      "Because memories live on Walrus rather than in one company database, they can follow you to other tools.",
    ],
  },
  {
    icon: Trash2,
    title: "You decide what stays",
    points: [
      "Every memory is listed on the Memory page in plain words. Forget any of them in one tap.",
      "Forgetting stops Sovra from recalling or using it straight away. The encrypted copy on Walrus can remain until its storage period ends.",
    ],
  },
  {
    icon: Wallet,
    title: "Balances from a trusted source",
    points: [
      "USDC balances and transfers come from the Sui blockchain through Tatum's RPC gateway, the same data anyone can verify on chain.",
    ],
  },
  {
    icon: EyeOff,
    title: "No ads, no selling data",
    points: [
      "Sovra doesn't sell your data or show ads.",
      "To answer questions, the relevant figures and memories are sent to an AI model provider. Answers can be wrong, so check before you act.",
    ],
  },
];

export default function SecurityPage() {
  useTitle("Security");
  return (
    <>
      <PageIntro title="How Sovra keeps you and your money safe">
        Plain answers to what Sovra can see, what it stores, and what it can never do.{" "}
        <Link to="/privacy" className="font-semibold text-cobalt hover:underline">
          Read the privacy policy
        </Link>{" "}
        for the full detail.
      </PageIntro>

      <Section className="!pt-0">
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {PILLARS.map((p) => (
            <li key={p.title} className="rounded-card bg-card p-6 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-cobalt-soft text-cobalt">
                <p.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-5 text-[20px] font-bold tracking-[-0.015em]">{p.title}</h2>
              <ul className="mt-3 flex flex-col gap-2.5 text-[15px] leading-relaxed text-muted">
                {p.points.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cobalt" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}

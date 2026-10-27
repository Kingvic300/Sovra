import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { CtaBand, PageIntro, Section } from "@/components/marketing/blocks";
import { CONTACT_EMAIL } from "@/lib/legal";
import { useTitle } from "@/lib/use-title";

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is Sovra a bank?",
    a: "No. Sovra is a personal finance app. It reads your bank statements and your USDC on Sui to help you understand and plan your money. It doesn't hold deposits, lend or move money.",
  },
  {
    q: "How does money get into my account?",
    a: (
      <>
        Your bank accounts work as usual; Sovra only reads the statements you import. For USDC, you send it to your own
        Sui address from an exchange (choose Sui as the withdrawal network) or from another Sui wallet. The Top up
        button shows your address and a QR code, and Sovra tells you when the deposit arrives.
      </>
    ),
  },
  {
    q: "Do I need to know anything about crypto?",
    a: "No. You sign in with Google and Sovra handles the rest. The Sui address is there if you want to hold USDC, and you can ignore it if you don't.",
  },
  {
    q: "What is zkLogin?",
    a: "A Sui feature that turns a normal sign-in, like Google, into a blockchain address. A zero-knowledge proof links the two, so there's no seed phrase and Sovra never sees your Google password.",
  },
  {
    q: "What happens if I lose access to my Google account?",
    a: "Your Sui address is tied to that Google account, so you could lose access to it. Keep your Google account secure, with two-step verification turned on.",
  },
  {
    q: "What does Sovra remember?",
    a: (
      <>
        Goals, limits, category corrections, decisions and preferences you share. Each one is shown on the Memory page in
        plain words, and you can forget any of them.{" "}
        <Link to="/security" className="font-semibold text-cobalt hover:underline">
          See how memories are stored
        </Link>
        .
      </>
    ),
  },
  {
    q: "Which banks work with Sovra?",
    a: "Any bank that lets you export a statement as CSV. Sovra detects the date, description and amount columns automatically and shows a preview before importing.",
  },
  {
    q: "Is Sovra's advice financial advice?",
    a: "No. Sovra explains your own numbers and goals. It isn't financial, tax, legal or investment advice, and AI answers can be wrong, so check before making big decisions.",
  },
  {
    q: "How much does Sovra cost?",
    a: "Sovra is free during early access.",
  },
  {
    q: "How do I delete my data?",
    a: (
      <>
        Forget individual memories on the Memory page, or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cobalt hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        to delete your account and imported data.
      </>
    ),
  },
];

export default function FaqPage() {
  useTitle("FAQ");
  return (
    <>
      <PageIntro title="Questions people ask before signing up">
        Can't find yours?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cobalt hover:underline">
          Email us
        </a>
        .
      </PageIntro>

      <Section className="!pt-0">
        <div className="grid gap-x-5 gap-y-3 lg:grid-cols-2">
          {FAQS.map((f) => (
            <details key={f.q} className="group self-start rounded-card bg-card shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="px-6 pb-6 text-[16px] leading-relaxed text-muted">{f.a}</div>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

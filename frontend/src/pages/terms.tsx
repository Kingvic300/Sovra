import { Link } from "react-router";
import { LegalLayout } from "@/components/legal/legal-layout";
import { CONTACT_EMAIL, type LegalSection } from "@/lib/legal";

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "Agreeing to these terms",
    body: (
      <>
        <p>
          These terms cover your use of Sovra, a personal finance app that reads your accounts, learns your goals and
          limits, and answers questions about your money. By creating an account or using the demo account, you agree to
          these terms and to our <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p>If you don't agree, please don't use Sovra.</p>
      </>
    ),
  },
  {
    id: "early-access",
    title: "Sovra is in early access",
    body: (
      <>
        <p>
          Sovra started as an entry to the Tatum and Walrus "Total Recall" hackathon and is still in early access. Features
          may change, move or be removed, and you may run into bugs. We'll try to give notice before changes that affect
          your data, but we can't promise that the service will always be available or work without errors.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Sovra",
    body: (
      <p>
        You must be at least 18 years old and able to agree to these terms. You may only use Sovra for your own personal
        finances.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Your account and wallet",
    body: (
      <>
        <p>
          You sign in by connecting a Sui wallet and signing a one-time message that proves you control its address.
          Sovra never sees your wallet's keys or recovery phrase and never asks it to approve a transaction.
        </p>
        <p>
          <strong>Keep your wallet secure.</strong> Anyone who controls your wallet can sign in to Sovra as you. If you
          lose access to your wallet, you may also lose access to any funds held there. Sovra can't recover a wallet for
          you.
        </p>
        <p>
          The demo account uses sample data in a temporary account. Anything you change in the demo is deleted when it
          expires.
        </p>
      </>
    ),
  },
  {
    id: "read-only",
    title: "Sovra only reads, it never moves money",
    body: (
      <>
        <p>Sovra is a read-only tool. It does not:</p>
        <ul>
          <li>hold, move, send or invest your money,</li>
          <li>ask for your bank login details,</li>
          <li>act as a bank, payment service, wallet provider or broker.</li>
        </ul>
        <p>
          Sovra reads bank statements you upload as CSV files and reads USDC and transactions at your Sui address. The
          top-up screen only shows your own Sui deposit address. You are responsible for any transfer you make to that
          address, including choosing the right network and asset.
        </p>
      </>
    ),
  },
  {
    id: "not-advice",
    title: "Not financial advice",
    body: (
      <p>
        Sovra gives general information based on the numbers you share and what you've told it. It is not financial,
        investment, tax or legal advice, and it doesn't know everything about your situation. Check important decisions
        yourself, and talk to a qualified professional where it matters.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI answers can be wrong",
    body: (
      <p>
        Sovra uses an AI model to answer questions and suggest categories. AI output can be incomplete, out of date or
        simply wrong, even when it sounds confident. Treat answers as a starting point and check figures against your own
        records before acting on them.
      </p>
    ),
  },
  {
    id: "your-content",
    title: "Your data and content",
    body: (
      <>
        <p>
          You own the statements you upload, the questions you ask and the goals, limits and notes you give Sovra. You
          give us permission to store and process that content only to run Sovra for you, including sending it to the
          service providers listed in our <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          Only upload data you have the right to share. Don't upload other people's personal financial records without
          their permission.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>When you use Sovra, don't:</p>
        <ul>
          <li>break the law or help anyone else do so, including money laundering or fraud,</li>
          <li>try to access accounts, data or systems that aren't yours,</li>
          <li>disrupt, overload, scrape or reverse-engineer the service,</li>
          <li>upload malware or content designed to manipulate the AI into harmful behaviour.</li>
        </ul>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Services we rely on",
    body: (
      <p>
        Sovra works with services run by other companies and networks, including the Sui wallet you sign in with, Walrus
        Memory and the Walrus network for storing memories, Tatum for reading the Sui blockchain, and an
        AI model provider. Their own terms apply to their services, and we aren't responsible for outages or changes on
        their side.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes to the service",
    body: (
      <p>
        We may update, pause or stop parts of Sovra at any time, for example to fix problems or because a provider
        changes its service. If we plan to shut Sovra down, we'll try to give you reasonable notice and a way to export
        your data first.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        Sovra is provided "as is" and "as available". To the extent the law allows, we don't promise that Sovra will be
        accurate, complete, uninterrupted or free of errors, or that it will meet your needs. Blockchain data and
        imported statements may be delayed or incomplete.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on our liability",
    body: (
      <>
        <p>
          To the extent the law allows, Sovra isn't liable for indirect or consequential losses, or for financial
          decisions you make based on information in the app. This includes losses from lost access to your wallet or Sui
          address, and from transfers you send to the wrong address or network.
        </p>
        <p>Nothing in these terms limits any liability that can't be limited by law.</p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Ending your use of Sovra",
    body: (
      <p>
        You can stop using Sovra at any time and ask us to delete your data by emailing{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may suspend or close accounts that break these
        terms or put other users or the service at risk.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms as Sovra grows. When we make important changes, we'll update the date at the top and
        tell you in the app before they take effect. If you keep using Sovra after that, you accept the new terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms and conditions"
      summary={
        <ul>
          <li>
            Sovra <mark className="remembered">only reads</mark> your money. It never holds, moves or invests it.
          </li>
          <li>Answers are general information, not financial advice. AI can be wrong, so check before you act.</li>
          <li>You sign in with a Sui wallet. Sovra can't recover it if you lose access.</li>
          <li>Sovra is in early access, so features may change.</li>
        </ul>
      }
      sections={SECTIONS}
    />
  );
}

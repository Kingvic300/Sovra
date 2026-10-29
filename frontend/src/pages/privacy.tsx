import { Link } from "react-router";
import { LegalLayout } from "@/components/legal/legal-layout";
import { CONTACT_EMAIL, type LegalSection } from "@/lib/legal";

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    title: "What this policy covers",
    body: (
      <p>
        This policy explains what information Sovra collects, why, who we share it with and the choices you have. It
        applies to the Sovra web app, including the demo account. Please read it with our{" "}
        <Link to="/terms">Terms and conditions</Link>.
      </p>
    ),
  },
  {
    id: "sign-in",
    title: "Signing in with a Sui wallet",
    body: (
      <>
        <p>
          You sign in by connecting a Sui wallet, such as Slush, and signing a one-time message. We check that signature to
          confirm you control the wallet's address. Signing isn't a transaction and can't move money.
        </p>
        <p>
          We receive your Sui address and the name you give us during setup. We never see your wallet's keys or recovery
          phrase.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "Information we collect",
    body: (
      <>
        <ul>
          <li>
            <strong>Account details:</strong> the name you give us and the Sui address you sign in with.
          </li>
          <li>
            <strong>Bank statements you upload:</strong> the dates, descriptions and amounts in the CSV files you choose
            to import.
          </li>
          <li>
            <strong>Blockchain data:</strong> USDC balances and transactions at your Sui address. This data is already
            public on the Sui blockchain.
          </li>
          <li>
            <strong>Memories:</strong> goals, spending limits, category corrections, decisions and preferences you give
            Sovra or confirm in the app.
          </li>
          <li>
            <strong>Questions:</strong> what you ask Sovra and the answers it gives.
          </li>
          <li>
            <strong>Browser storage:</strong> your session and preferences, kept in your browser's local storage.
          </li>
        </ul>
        <p>We never ask for your bank login details, and Sovra can't move money.</p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use your information",
    body: (
      <>
        <p>We use your information only to run Sovra for you:</p>
        <ul>
          <li>to show your balances, spending, budgets, goals and recurring payments,</li>
          <li>to categorize transactions and remember the corrections you make,</li>
          <li>to answer your questions using your figures and what you've told Sovra,</li>
          <li>to keep the service secure and fix problems.</li>
        </ul>
        <p>
          We don't sell your information, we don't show ads, and we don't use your financial data to market other
          products to you.
        </p>
      </>
    ),
  },
  {
    id: "memories",
    title: "How memories are stored on Walrus",
    body: (
      <>
        <p>
          Sovra stores memories with Walrus Memory. When Sovra saves a memory, a Walrus Memory relayer reads the text to
          create a search index (called embeddings), encrypts the memory and stores it on the Walrus decentralized
          storage network. The relayer also processes the text when Sovra searches your memories to answer a question.
        </p>
        <p>
          You can see every memory on the Memory page and forget any of them. When you forget a memory, Sovra removes it
          from your memory index, so it is no longer recalled or used in answers.{" "}
          <strong>
            The encrypted copy already written to Walrus may stay on the network until its storage period ends.
          </strong>{" "}
          Decentralized storage can't always delete data on request, which is why memories are encrypted before they are
          stored.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "How AI is used",
    body: (
      <p>
        To answer a question or suggest a category, Sovra sends our AI model provider the question, the figures needed to
        answer it and the memories that are relevant. We send only what that request needs, and we'll name the
        provider here before Sovra leaves early access.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "Who we share information with",
    body: (
      <>
        <p>We share information only with the services that make Sovra work:</p>
        <ul>
          <li>
            <strong>Walrus Memory and the Walrus network</strong>, to process and store your memories.
          </li>
          <li>
            <strong>Tatum</strong>, to read your USDC balance and transactions from the Sui blockchain.
          </li>
          <li>
            <strong>Our AI model provider</strong>, to answer questions and categorize transactions.
          </li>
          <li>
            <strong>Our hosting provider</strong>, to run the app.
          </li>
        </ul>
        <p>
          We may also share information if the law requires it, or to protect Sovra and its users from fraud or abuse.
        </p>
      </>
    ),
  },
  {
    id: "demo",
    title: "The demo account",
    body: (
      <p>
        The demo account uses sample data in a private account that only your browser can open. It isn't linked to
        any wallet, and it is deleted automatically when it expires.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <p>
        We keep your information while you have an account. If you ask us to delete your account, we delete the data we
        hold, such as imported transactions and your memory index. Encrypted memories already written to
        Walrus may remain until their storage period ends, as explained above. Public blockchain data stays on the Sui
        blockchain and is outside our control.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We use encrypted (HTTPS) connections, encrypt memories before they are stored on Walrus, and limit who can access stored
        data. No system is perfectly secure, so we can't guarantee that information will never be accessed without
        permission. Keeping your wallet and its recovery phrase safe is the best way to protect your Sovra account.
      </p>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices",
    body: (
      <>
        <ul>
          <li>See and forget individual memories on the Memory page.</li>
          <li>Choose which statements to upload, and stop importing at any time.</li>
          <li>Sign out, which clears your session from this browser.</li>
          <li>
            Ask for a copy of your data or for your account to be deleted by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "age",
    title: "Age limit",
    body: <p>Sovra is for people aged 18 or over. We don't knowingly collect information from anyone younger.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change how we handle your information, we'll update the date at the top of this page and tell you in the
        app before the change takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions or requests about your data? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      summary={
        <ul>
          <li>We use your data only to run Sovra for you. We don't sell it and we don't show ads.</li>
          <li>Sovra reads your statements and Sui wallet. It never asks for bank logins and never moves money.</li>
          <li>
            Memories are <mark className="remembered">encrypted and stored on Walrus</mark>. Forgetting one stops Sovra
            using it, but the encrypted copy may stay on Walrus until its storage period ends.
          </li>
          <li>Your questions and the relevant figures are sent to an AI provider to produce answers.</li>
        </ul>
      }
      sections={SECTIONS}
    />
  );
}

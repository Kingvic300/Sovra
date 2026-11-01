# x402 agent payments on Sui: feasibility note

Issue #14. Research only: nothing here is implemented, and nothing should be without explicit approval.

**Recommendation: skip x402 for this submission.** If the team still wants the bonus, build only the minimal, opt-in demo described below, on its own branch, after the core checklist is done and after someone approves the copy changes.

## 1. Requirements

### Hackathon bonus

The official page, [tatum.io/hackathon/total-recall](https://tatum.io/hackathon/total-recall), renders with JavaScript, so its rules couldn't be read for this note. **Someone needs to read the official rules before any work starts.** Third-party sources only:

- A participant's repository ([Bluff](https://github.com/OpeyemiMoses/Bluff)) lists a "Best Use of Agent Payments" award, "Best app across tracks using x402 or MPP, settled on Sui".
- One hackathon list gives the deadline as 10 November 2026.

Neither is confirmed. In particular, whether "settled on Sui" means mainnet only matters: the x402 Sui spec defines only `sui:mainnet` (see below).

### x402 on Sui today

- **Spec.** [`scheme_exact_sui.md`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_sui.md) (x402 v2, `exact` scheme). The server answers `402` with payment requirements: `network: "sui:mainnet"`, `asset` (a coin type), `amount`, `payTo` and `maxTimeoutSeconds`. The client retries with a payload holding a **Sui transaction the payer built and signed**, which transfers `amount` to `payTo` (`payload.transaction` in base64, `payload.signature`). The facilitator verifies it by checking the signature and simulating the balance change, then settles it by broadcasting the transaction. Gas sponsorship is optional (`extra.gasStation`). No testnet network id is defined.
- **Facilitators.** The [x402 facilitator directory](https://docs.x402.org/dev-tools/facilitators) lists one for Sui: [sui-x402-facilitator](https://github.com/DrVelvetFog/sui-x402-facilitator) (UIG Studios, Apache-2.0). It is non-custodial and zero-fee, supports USDC on `sui:mainnet` (first payment 12 June 2026) and `sui:testnet` (its own proposed id), and is hosted on Render. Gas sponsorship is not on the hosted instance, so payers need SUI for gas as well as USDC. It is a single independent project, and its pull request to the official directory was still open when this note was written.
- **Client side.** A Sui client SDK exists ([`@sui-x402/core`](https://forums.sui.io/t/an-x402-client-sdk-middleware-for-sui-testnet-feedback-wanted/49421)), but it is testnet-only and asking for feedback. Building and signing a USDC transfer with `@mysten/sui` and the dapp-kit already in the frontend is straightforward without it.

## 2. Fit with Sovra's promise

Sovra's whole pitch is that it **only reads and never moves money**. That promise is made in about 20 places:

- `README.md` ("Sovra is read-only. It never moves money").
- Terms, section "Sovra only reads, it never moves money".
- Privacy ("Signing isn't a transaction and can't move money").
- Security, FAQ, How it works, Home, Auth, Onboarding, Accounts and Profile copy.
- The sign-in toast ("It's free and can't move money").
- The Ask system prompt in `backend/src/ai/groq.provider.ts` ("You cannot move, send, pause or cancel anything").
- Code comments that promise the wallet code never builds, signs or sends a transaction (`tatum.service.ts`, `wallet-sync.service.ts`).

With x402, the user's wallet signs a real transfer to Sovra. Even opt-in and clearly labelled, that breaks "never asks for a transaction". It also asks users to trust a finance app that just told them signing can't move money. For a product whose differentiator is trust, the risk is to the brand, not the code.

## 3. Where signing, custody and consent would sit

| Concern | What it would take |
| --- | --- |
| Signing | In the browser, with the connected Sui wallet (dapp-kit `signTransaction`), the same place sign-in signs its challenge today. The backend never sees a key. |
| Who can pay | Only wallet accounts. Email accounts have no wallet, and demo accounts have an address nobody holds keys for. Both would need a "connect a wallet to use this" path, or no premium feature. |
| Custody | Sovra holds no keys: `payTo` is just a receiving address, and the facilitator only broadcasts the payer's signed transaction. Someone still has to own the private key for `payTo` and account for the funds it receives. |
| Gas | The payer needs SUI for gas on top of USDC, unless Sovra runs a gas station (Enoki), which is more keys and cost. |
| Consent UX | A separate confirmation before the wallet prompt, with the exact amount, recipient and what's being bought, plus "this is the only time Sovra asks you to send money". Never automatic, never stored as a standing approval. |
| Facilitator | Use the hosted third-party facilitator: one dependency on a free-tier host, and it sees payment metadata. Or verify in-house: simulate the transaction and check the balance change, then execute it through the Tatum Sui gateway. That avoids the third party but means writing payment-verification code. |
| Receipts and refunds | Store each settled digest with the Ask request it paid for. Decide what happens when settlement succeeds but Groq fails (refund, or a credit). |
| Legal copy | Terms: paid features, pricing, refunds, no custody. Privacy: payment transactions are public on Sui, and the facilitator processes payment data. The "never moves money" lines in section 2 would all change to "never moves money without your explicit confirmation". |

## 4. Options

| Option | What it is | Effort | Risk |
| --- | --- | --- | --- |
| **Skip** (recommended) | Leave x402 out. Keep the read-only story as the strongest submission angle. | None | Gives up an unconfirmed bonus |
| **Minimal demo** | Wallet accounts only, behind a flag. A "deeper answer" Ask costs, for example, 0.01 USDC. `POST /ask/premium` answers 402 with requirements. The frontend shows a confirmation dialog, then the wallet signs, and the server verifies and settles through the facilitator before calling the model. Copy changes as in section 3. | About 3 to 4 days, including copy, tests and a mainnet trial | Brand promise, mainnet-only spec, third-party facilitator uptime, SUI needed for gas |
| **Full** | Paid tiers, credits, gas sponsorship, in-house verification, refunds. | 2+ weeks | All of the above, plus running a payments product |

Effort assumes the core issues are done. The minimal demo is about 1 day backend (a 402 guard on one route, facilitator client, receipts table and migration, e2e tests with a fake facilitator), 1 day frontend (transaction building, confirmation dialog, error states), and 1 to 2 days for copy, legal review and a real mainnet payment.

## 5. Decision needed

1. Someone reads the official Total Recall rules: does the agent-payments bonus exist, how much is it, and does it need mainnet settlement?
2. If it's worth it, the product owner approves changing the "never moves money" promise everywhere it appears.
3. Only then start the minimal demo, on its own branch, with no merge until it's reviewed.

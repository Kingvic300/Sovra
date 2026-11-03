<p align="center">
  <img src="frontend/public/brand/sovra-app-icon.svg" width="72" alt="Sovra logo" />
</p>

<h1 align="center">Sovra</h1>

<p align="center"><strong>The money app that remembers your goals.</strong></p>

<p align="center">
  A personal finance app that learns your goals, limits and decisions, keeps them in a memory vault on Walrus, and uses them every time you check a budget or ask a question.
</p>

<p align="center">
  Built for the <a href="https://tatum.io/hackathon/total-recall">Tatum x Walrus "Total Recall" hackathon</a>, Consumer Finance Apps track.
</p>

---

## Contents

- [Why Sovra](#why-sovra)
- [What it does](#what-it-does)
- [How it uses Walrus, Tatum and Sui](#how-it-uses-walrus-tatum-and-sui)
- [Private expense auditor (NEAR AI Cloud, TEE)](#private-expense-auditor-near-ai-cloud-tee)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Frontend routes](#frontend-routes)
- [Backend API](#backend-api)
- [Design system](#design-system)
- [Project status](#project-status)
- [Hackathon checklist](#hackathon-checklist)
- [License](#license)

## Why Sovra

Most money apps forget you the moment you close them. You set a budget, explain a big month, correct the same merchant again, and next time the app starts from zero.

Sovra keeps that context. Every goal, limit, category correction and decision becomes a memory written in plain words. Before Sovra shows a budget warning or answers a question, it recalls what you told it. Advice gets more personal every week instead of resetting every login.

**Example.** In September you tell Sovra you're saving for a $1,200 laptop and want to keep entertainment under $100. In October, Spotify and Netflix are about to renew. Sovra counts both renewals before they land, sees entertainment would end the month at $111, and offers to pause Netflix so the laptop fund stays on track. When you choose, the decision itself is remembered for next time.

## What it does

| Area | What you get |
|---|---|
| **Overview** | Total balance across bank accounts and USDC on Sui, a 30-day trend, what Sovra remembers, live budget status and a goal tracker |
| **Transactions** | Imported transactions with search and filters. Change a category and Sovra asks "Always file Amazon under business supplies?" and learns the rule |
| **Budgets** | Monthly limits that count scheduled renewals as hatched segments before they hit, plus suggestions based on your history. When a budget is heading over, **What should I cut?** has the AI pick which renewals to pause and which habits to skip, with the saving for each, and it leaves alone anything you told Sovra matters to you |
| **Goals** | Savings goals with progress, weekly amounts and target dates. Once a statement is imported, Sovra works out what you really keep each month and says whether each goal is on track, and when you'd reach it |
| **Recurring** | Bills and subscriptions found in your transactions, with reminders and Pause/Resume. Pausing really frees the money in your budgets |
| **Memory** | Every memory Sovra keeps, in plain words with the key phrase highlighted. Filter by type and forget anything, with Undo |
| **Ask Sovra** | Plain-language questions answered from your numbers and memories, showing which memories the answer used |
| **Accounts and top-up** | Your Sui wallet read live through Tatum, CSV statement import, and a USDC top-up flow with QR code and deposit watching |
| **Onboarding** | Four short steps (name, money sources, a goal with payday, one spending limit) with a live panel showing what Sovra will remember |

Sovra is **read-only**. It never moves money, never holds funds and never asks for a bank password.

## How it uses Walrus, Tatum and Sui

### Walrus Memory: the learning loop

Goals, limits, corrections, decisions and preferences are stored as memories with [Walrus Memory](https://docs.wal.app/walrus-memory) on Walrus mainnet. Each user has their own namespace (`sovra-<address>`).

- **Write:** onboarding answers, "remember this category", accepted or rejected budget suggestions, and pause or keep decisions all call `remember()`.
- **Read:** Ask Sovra and the budget insights call `recall()` before answering, and the answer lists the memories it used.
- **See and control:** the Memory page lists everything in plain words. Forgetting stops Sovra from using a memory immediately. The encrypted copy on Walrus stays until its storage period ends, because the SDK has no delete; the privacy policy says so.

### Tatum: live onchain data

Sovra reads the user's USDC balance and transfers on Sui mainnet through Tatum's Sui gateway (`https://sui-mainnet.gateway.tatum.io/graphql`, `x-api-key` header). The top-up flow watches the same balance to confirm a deposit arrived. USDC is Circle's native coin type `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`.

### Sui wallet sign-in

Users connect any Sui wallet through `@mysten/dapp-kit-react`: browser extensions found through the Wallet Standard, or the Slush web wallet, which needs no install. To start a backend session, the wallet signs a one-time challenge and the backend verifies it with `verifyPersonalMessageSignature`. Sovra never asks the wallet to approve a transaction.

### Groq: answers and categorization

Ask Sovra and CSV categorization run on Groq's OpenAI-compatible API. By default `openai/gpt-oss-120b` writes answers and `openai/gpt-oss-20b` categorizes merchants with strict JSON output. Answers are grounded in the user's own budgets, goals, transactions, bills and recalled memories, and the prompt forbids investment, tax or legal advice.

## Private expense auditor (NEAR AI Cloud, TEE)

Built for the Privacy & Private AI track. Open **`/audit`** (no account needed; also in the app sidebar as **Private audit**), drop in receipts or a bank statement, and a model running inside a trusted execution environment (TEE) on [NEAR AI Cloud](https://docs.near.ai/cloud/) sorts the spending into categories and flags anything unusual. A **Verified** panel lists every check that proved the analysis ran inside the TEE.

### Nothing is kept server-side

The auditor stores nothing once a response returns:

- `backend/src/audit/` has no database, cache, queue or file system access, and it never reads a session cookie.
- Uploads stay in memory (multer memory storage). The controller overwrites the upload buffers with zeros in a `finally` block before the handler returns.
- Nothing logs file contents, merchants, amounts or model output.
- Responses carry `Cache-Control: no-store`, and the browser sends uploads with `credentials: "omit"`.
- The only trace left is the per-IP request counter the rate limiter keeps in memory. It holds no content and expires within the hour. The Intel collateral cache holds public, Intel-signed platform data, never user data.

The audit doesn't touch the rest of Sovra: nothing is imported into your transactions or written to Walrus Memory.

### How it works

1. **Model.** The model comes from `GET https://cloud-api.near.ai/v1/models`. Entries with `owned_by: "nearai"` run on NEAR's own confidential GPU fleet (the "Confidential TEE" tier). The default is `Qwen/Qwen3.8-27B`, which reads text and images (photos of receipts) and supports structured output. Set `NEAR_AI_MODEL` to use another one.
2. **Preflight attestation.** Before any private data is sent, the backend calls `GET /v1/attestation/report` with a fresh 32-byte random nonce, `signing_algo=ecdsa`, `provider=near` and `x-no-aliasing: true`. It verifies the report as the [verification docs](https://docs.near.ai/cloud/verification) describe (`backend/src/near/attestation.ts`). If any check fails, nothing is sent.
3. **Rule-based leads.** Code checks the rows for duplicate charges, amounts far above a merchant's usual, subscription price rises, fees, large round transfers, big one-off merchants and weekend cash (`backend/src/audit/anomalies.ts`). The model gets these as leads to confirm or dismiss.
4. **Private completion.** CSV rows are parsed on the server. PDF and text receipts are sent as text. The model returns categories, receipt totals, flags and a summary as strict JSON. Statement amounts are never taken from the model.
5. **Signed answer.** The backend hashes the exact request and response bytes with SHA-256, then fetches `GET /v1/signature/{id}`. It checks that the signed text is `<model>:<request hash>:<response hash>`, recovers the EIP-191 ECDSA signer, and checks that the signer is the key the model TEE attested.

### What the Verified panel checks

| Scope | Check |
|---|---|
| Gateway and model (Intel TDX) | The report echoes our nonce |
| | The TDX quote verifies with [dcap-qvl](https://github.com/Phala-Network/dcap-qvl) against Intel's root CA, and the TCB status is `UpToDate` |
| | The TD isn't in debug mode |
| | `report_data[0:32]` is the signing address and `report_data[32:64]` is our nonce, both read from the verified quote |
| | `MRCONFIGID` = `0x01` ‖ SHA-256(`app_compose`) ‖ 15 zero bytes |
| | Replaying the event log reproduces `RTMR3` |
| GPU (NVIDIA) | `nvidia_payload` carries our nonce |
| | NVIDIA NRAS returns `x-nvidia-overall-att-result: true` |
| Response | The signature covers SHA-256 of our exact request and response |
| | The ECDSA signature recovers to the signing address |
| | That address is the attested model key |

**Show evidence** lists the nonce, signing key, hashes, completion id and the container image digests pinned in the attested compose file.

Not checked yet: build provenance (Sigstore) for those image digests, and TLS certificate binding. TLS binding needs the peer certificate from the same connection, which the backend doesn't capture. The panel says so.

### Run it

```bash
# backend/.env
NEAR_AI_API_KEY=...          # from cloud.near.ai; the account needs credits for completions

npm --prefix backend run build
npm --prefix backend run near:check   # one completion plus full verification, printed check by check
npm run dev:backend && npm run dev:frontend   # then open http://localhost:5173/audit
```

### Sample documents

All fictional, in `frontend/public/samples/`. The page loads them with **Use fictional samples**.

| File | What's planted in it |
|---|---|
| `northwind-checking-oct-2026.csv` | A double charge (Pixelport, 129.99 twice on one day), a ride 4x the usual price, a streaming price rise, maintenance, overdraft and foreign transaction fees, a round 1,000 transfer, and Sunday cash withdrawals |
| `northwind-checking-sep-2026.csv` | The month before, which sets the usual prices |
| `receipt-greenleaf-grocers.txt` | A total of 46.11 when the subtotal, tax and bag fee add up to 41.71 |
| `receipt-harbor-light-cafe.txt` | A tip added on top of a service charge that was already included |
| `brightwater-card-oct-2026.xlsx` | A credit card statement in Excel, with a title block above the table: an annual app subscription billed twice, a delivery order 3x the usual size, and a late payment fee |
| `receipt-pixelport-photo.jpg` | A photo of a receipt that says it was charged once (the statement shows it twice), with small print that tells the AI to "ignore all previous instructions" |

### File types and how uploads are checked

| Kind | Formats |
|---|---|
| Statements | CSV/TSV, Excel `.xlsx` (every sheet), PDF, OFX/QFX, QIF |
| Receipts | Photos (JPG, PNG, WebP, GIF), PDF, Word `.docx`, plain text, JSON |

Each upload goes through `backend/src/audit/file-guard.ts` before any parser sees it:

- **Real type from the bytes.** Magic numbers decide what a file is. The name and the browser's MIME type are ignored, so an executable renamed to `.csv` is refused. Old binary Office files (`.xls`, `.doc`), HEIC photos, UTF-16 text and anything else unknown are refused, with a message saying what to convert to.
- **Office files.** The ZIP central directory is read without inflating anything. A file is refused if it would unpack to more than 40 MB, compresses suspiciously well (a zip bomb), is encrypted, has more than 2,000 entries, or carries macros (`vbaProject.bin`) or ActiveX controls. Excel cells give their cached values, never their formulas.
- **PDFs.** pdf.js runs with font faces off and `stopAtErrors` on. Files over 60 pages are refused.
- **Text.** Text must be valid UTF-8 with no NUL bytes. Control characters, bidirectional overrides, zero-width characters and chat-template tokens such as `<|im_start|>` and `<think>` are stripped.
- **Formula injection.** Descriptions lose a leading `=`, `+` or `@`.
- **Prompt injection.** Statement rows, documents and images are marked as untrusted data in the system prompt, and the model must flag any instructions hidden in them instead of following them. Code also scans the text for phrases like "ignore previous instructions" and reports them as a high-severity finding, even if the model misses them. Statement amounts are never taken from the model, flags may only cite rows that exist, and every model string is cleaned before it is returned.
- **Limits.** Up to 6 files per audit, 5 MB each, and up to 4 photos.

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser: frontend (Vite + React)"]
    UI["Marketing, onboarding, app screens"]
    ZK["Sui wallet (dapp-kit)"]
  end

  subgraph API["backend (NestJS, /api)"]
    AUTH["Auth: nonce, verify, session cookie"]
    WAL["Wallet service"]
    MEM["Memory service"]
    TX["Transactions, budgets, goals, recurring"]
    ASK["Ask service"]
  end

  UI -- "/api (cookie session)" --> API
  ZK -- "signed challenge" --> AUTH
  AUTH -- "verify wallet signature" --> SUI["Sui mainnet (GraphQL)"]
  WAL -- "x-api-key" --> TATUM["Tatum Sui gateway"]
  TATUM --> SUI
  MEM -- "remember / recall" --> WALRUS["Walrus Memory relayer"]
  WALRUS --> WALRUSNET["Walrus mainnet"]
  ASK --> GROQ["Groq API"]
  ASK --> MEM
  TX --> DB[("Postgres (Drizzle)")]
  ASK --> DB
```

Secrets (Tatum key, Walrus Memory delegate key, Groq key, session secret) live only on the backend. The frontend needs no keys at all.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Vite 8, React 19, TypeScript, React Router, Tailwind CSS v4, lucide-react, qrcode.react, Hanken Grotesk |
| Sui | `@mysten/dapp-kit-react` (wallet connect), `@mysten/sui` |
| Backend | NestJS, TypeScript, zod, Drizzle ORM, Postgres (`postgres-js`), JWT session cookie |
| Integrations | Walrus Memory (`@mysten-incubation/memwal`), Tatum Sui gateway, Groq |
| Tooling | oxlint, tsc, drizzle-kit |

## Repository layout

```
.
├── frontend/            Vite + React app
│   ├── public/brand/    Logo, mark and app icon (SVG)
│   └── src/
│       ├── pages/       Marketing, auth, onboarding, app screens, legal, 404
│       ├── components/  Shell (sidebar, top bar), UI kit, feature components
│       └── lib/         Auth and data stores, API client, formatting, demo data
├── backend/             NestJS API (see backend/README.md)
│   ├── src/             One module per area: auth, wallet, memory, ai, ask, ...
│   ├── drizzle/         SQL migrations
│   └── Dockerfile       Production image (see DEPLOYMENT.md)
├── design/              Design explorations: colour directions, logo options
├── docker-compose.yml   Local Postgres + backend
├── DEPLOYMENT.md        Docker image, hosting, env, cookies, cron
├── LICENSE
└── README.md
```

## Getting started

### Requirements

- Node.js 24 and npm
- Postgres for the backend's data routes (Neon, Supabase, Railway or local). Optional to start: the server boots without it.

### Install

```bash
git clone https://github.com/Kingvic300/Sovra.git
cd Sovra
npm run install:all
```

### Run the frontend only

The frontend works on its own with demo data, so this is the quickest way to look around.

```bash
npm run dev:frontend          # http://localhost:5173
```

Open http://localhost:5173 and choose a wallet or **Explore with a demo account**. Without a backend, every screen shows the sample story and saves changes in your browser.

### Run the full stack

```bash
cp backend/.env.example backend/.env
# Set at least SESSION_SECRET (openssl rand -hex 32). Add the other keys as you get them.

npm --prefix backend run db:migrate   # once DATABASE_URL is set
npm run dev:backend                   # http://localhost:8787/api/health

npm run dev:frontend
```

The Vite dev server proxies every `/api` request to the backend on port 8787. Once the backend has verified your session, every screen reads and saves through it.

With Docker, `docker compose up --build` replaces the first three steps: it starts Postgres and the backend with migrations applied. See [DEPLOYMENT.md](DEPLOYMENT.md) for the image, production settings and scheduled jobs.

### Scripts

| Command | What it does |
|---|---|
| `npm run install:all` | Install frontend and backend dependencies |
| `npm run dev:frontend` | Vite dev server on :5173 |
| `npm run dev:backend` | NestJS in watch mode on :8787 |
| `npm run build` | Production builds of both apps |
| `npm run lint` | Lint the frontend with oxlint |

## Configuration

### Frontend

The frontend needs no environment variables. In production, `/api` must reach the backend on the same origin (a rewrite in `frontend/vercel.json`), because the session cookie is `SameSite=Lax`.

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | yes | Signs the session cookie |
| `PORT` | no | Defaults to `8787` |
| `FRONTEND_ORIGIN` | no | CORS origin. Defaults to `http://localhost:5173` |
| `DATABASE_URL` | for data routes | Postgres connection string |
| `TATUM_API_KEY` | for wallet reads | Tatum dashboard API key |
| `MEMWAL_KEY` | for memories | Walrus Memory delegate **private** key |
| `MEMWAL_ACCOUNT_ID` | for memories | Walrus Memory account ID |
| `MEMWAL_SERVER_URL` | no | Defaults to the mainnet relayer |
| `GROQ_API_KEY` | for Ask Sovra | Groq API key |
| `GROQ_MODEL` / `GROQ_FAST_MODEL` | no | Default to `openai/gpt-oss-120b` / `openai/gpt-oss-20b` |
| `NEAR_AI_API_KEY` | for the private auditor | NEAR AI Cloud API key |
| `NEAR_AI_MODEL` | no | TEE model id. Defaults to `Qwen/Qwen3.8-27B` |
| `RATE_LIMIT_AUDIT_PER_HOUR` | no | Audits per hour per IP. Defaults to `20` |

Any integration without its key answers `503 {"error":{"code":"not_configured"}}` and the server keeps running. `GET /api/health` shows which ones are configured.

> Never put secret keys in `frontend/.env*`. Anything prefixed `VITE_` is bundled into the browser.

## Frontend routes

| Route | Page |
|---|---|
| `/` | Home |
| `/how-it-works`, `/security`, `/faq` | Marketing pages |
| `/signin`, `/signup` | Email and password, Sui wallet, or demo account |
| `/onboarding` | Four-step setup |
| `/app` | Overview |
| `/app/transactions`, `/app/budgets`, `/app/goals`, `/app/recurring` | Money screens |
| `/app/accounts` | Sui wallet, top-up, CSV import |
| `/app/memory` | What Sovra remembers |
| `/app/ask` | Ask Sovra |
| `/audit`, `/app/audit` | Private expense auditor (TEE on NEAR AI Cloud) |
| `/terms`, `/privacy` | Legal |
| anything else | 404 |

Route protection is switched off for now so every screen can be opened directly. Turn it on with `ROUTE_GUARDS_ENABLED` in `frontend/src/lib/config.ts`.

## Backend API

All routes are under `/api` and return errors as `{ "error": { "code", "message" } }`. Everything except `health` and `auth/*` needs the session cookie. Full details are in [backend/README.md](backend/README.md).

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/nonce`, `POST /auth/verify`, `POST /auth/signup`, `POST /auth/login`, `POST /auth/demo`, `POST /auth/logout` |
| Profile | `GET /me`, `PUT /me/profile` |
| Wallet | `GET /wallet/balance`, `GET /wallet/transactions`, `GET /wallet/deposit` |
| Memories | `GET /memories`, `POST /memories`, `POST /memories/recall`, `DELETE /memories/:id` |
| Transactions | `GET /transactions`, `POST /transactions/import`, `PATCH /transactions/:id` |
| Budgets | `GET /budgets`, `PUT /budgets/:category`, `DELETE /budgets/:category` |
| Goals | `GET /goals`, `POST /goals`, `PATCH /goals/:id`, `DELETE /goals/:id` |
| Recurring | `GET /recurring` |
| Ask | `POST /ask` |
| Private audit (no session) | `GET /audit/status`, `GET /audit/attestation`, `POST /audit` (multipart `files`) |

## Design system

The "Porcelain" direction: cool, bright and calm, with a highlighter mark on everything Sovra remembers.

| Token | Value | Use |
|---|---|---|
| Porcelain | `#EBF0F6` | Page background |
| Card | `#FFFFFF` | Surfaces |
| Ink | `#0F1B33` | Text, dark panels |
| Muted | `#56657E` | Secondary text |
| Cobalt | `#2340D0` | Primary actions, brand |
| Highlighter | `#FFE15A` | Remembered facts |
| Gain / Caution / Over | `#0E7D57` / `#B76E00` / `#C9323A` | Money states |

Type is Hanken Grotesk throughout, with tabular figures for amounts. The logo is a squared "ledger S" drawn as one continuous line; the app icon is the white S on a navy tile with a cobalt signal dot. Explorations are in [`design/`](design/).

## Project status

This is a hackathon build. What works today, and what is still being connected:

- **Done:** every screen and flow in the frontend; the backend API with Tatum, Walrus Memory, Groq, CSV import, learned category rules, recurring detection and wallet signature checks; toasts, validation and error handling throughout.
- **Connected:** once the backend verifies the session, the app reads and saves accounts, transactions, budgets and budget suggestions, goals, memories, recurring charges (including pause and resume), reminders, Ask history, and data export and account deletion through it. The demo account gets the sample story without a reachable backend; a real account shows empty screens instead of sample data.
- **Browser only:** which overview insights you've answered is kept per address in the browser.
- **End-to-end checks:** see [docs/e2e.md](docs/e2e.md) for the last recorded run and the manual checklist.

## Hackathon checklist

- [ ] Walrus Memory writing on mainnet, at least 10 memories
- [ ] Tatum Sui gateway used for onchain data
- [x] Public repo
- [ ] Working demo deployed
- [ ] Blog post: what it does, how it uses Tatum and Walrus, how it learned over time
- [ ] 2 to 3 minute demo video
- [ ] Submission form: Tatum ID, Sui address, Sui account ID, `MEMWAL_AGENT_ID`

## License

[MIT](LICENSE)

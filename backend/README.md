# Sovra backend

NestJS API for Sovra. It verifies Sui wallet sign-ins, reads USDC on Sui through Tatum, stores what Sovra learns in Walrus Memory, answers questions with Groq, and keeps transactions, budgets and goals in Postgres.

The frontend (Vite, `:5173`) proxies `/api` to this server (`:8787`). Sessions are an HTTP-only cookie holding a signed JWT.

## Run it

```bash
cd backend
npm install
cp .env.example .env        # set SESSION_SECRET at minimum
npm run db:migrate          # once DATABASE_URL is set
npm run start:dev           # http://localhost:8787/api/health
```

Only `SESSION_SECRET` is required. Any integration without keys answers `503 {"error":{"code":"not_configured"}}`, and the server still boots. `GET /api/health` shows which integrations are configured.

| Script | What it does |
| --- | --- |
| `npm run start:dev` | Compile with tsc and restart on change |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run `dist/main.js` (reads `.env` if present) |
| `npm run demo:cleanup` | Delete expired demo accounts once (after `build`). For a cron job |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and integration tests (see below) |
| `npm run db:generate` | Create a migration from `src/database/schema.ts` |
| `npm run db:migrate` | Apply migrations in `drizzle/` to `DATABASE_URL` |

## Tests

```bash
npm test                      # compile to dist-test/ and run every *.spec.ts with node:test
TEST_LOGS=1 npm test          # also print server-side errors and warnings
```

Tests need no database, keys or network:

- **Unit tests** sit next to the code (`src/**/*.spec.ts`): recurring detection, CSV parsing, categories, memory sentences, Tatum transfer parsing, the Groq provider (with `fetch` mocked), env validation and error handling.
- **Integration tests** (`src/e2e/*.e2e.spec.ts`) boot the real `AppModule` on a random port with the same HTTP setup as `main.ts` (`src/app.setup.ts`). The database is in-process Postgres ([PGlite](https://pglite.dev)) with the migrations in `drizzle/` applied, so a schema change without a migration fails the tests.
- Groq, Walrus Memory and Tatum are never called. `src/testing/` has fakes (`FakeAi`, `FakeMemWal`) and helpers: `createTestApp`, `createTestDatabase`, and `signIn`, which runs the real nonce + signature flow with an Ed25519 key (verified offline, same code path as a wallet).

CI (`.github/workflows/ci.yml`) runs typecheck, build and tests for the backend, and lint and build for the frontend, on every pull request and push to `main`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | Signs the session cookie. At least 16 characters. |
| `PORT` | no | Defaults to `8787`. |
| `FRONTEND_ORIGIN` | no | CORS origin allowed with credentials. Defaults to `http://localhost:5173`. |
| `NODE_ENV` | no | `production` makes the cookie `Secure` and adds HSTS. |
| `TRUST_PROXY` | no | Proxies in front of the API. Defaults to `1`; use `false` when clients connect directly. See [Security](#security). |
| `RATE_LIMIT_GLOBAL_PER_MINUTE` | no | Requests per minute per IP, all routes. Defaults to `300`. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | no | `/auth/nonce` + `/auth/verify` per minute per IP. Defaults to `20`. |
| `RATE_LIMIT_DEMO_PER_HOUR` | no | `/auth/demo` per hour per IP. Defaults to `10`. |
| `RATE_LIMIT_ASK_PER_HOUR` | no | `/ask` per hour per user. Defaults to `30`. |
| `RATE_LIMIT_IMPORT_PER_HOUR` | no | `/transactions/import` (previews included) per hour per user. Defaults to `30`. |
| `RATE_LIMIT_WALLET_SYNC_PER_HOUR` | no | `/wallet/sync` per hour per user. Defaults to `12`. |
| `WALLET_SYNC_MAX_PAGES` | no | Pages of 50 transactions one sync reads. Defaults to `10`; longer histories continue on the next sync. |
| `RATE_LIMIT_DEMO_ASK_PER_HOUR` | no | `/ask` per hour per IP from demo accounts, on top of the per-user limit. Defaults to `10`. |
| `DEMO_TTL_HOURS` | no | How long a demo account lives. Defaults to `24`. |
| `DATABASE_URL` | for data routes | Postgres connection string. |
| `TATUM_API_KEY` | for wallet reads | Sent as `x-api-key` to Tatum's Sui gateway. |
| `MEMWAL_KEY` | for memories | Walrus Memory delegate **private** key. Server only. |
| `MEMWAL_ACCOUNT_ID` | for memories | Walrus Memory account ID. |
| `MEMWAL_SERVER_URL` | no | Defaults to the mainnet relayer `https://relayer.memory.walrus.xyz`. |
| `GROQ_API_KEY` | for Ask Sovra and AI categorization | Groq API key. Server only. |
| `GROQ_MODEL` | no | Model for answers. Defaults to `openai/gpt-oss-120b`. |
| `GROQ_FAST_MODEL` | no | Model for CSV categorization. Defaults to `openai/gpt-oss-20b`. |

## Endpoints

All routes are under `/api`. Everything except `health` and `auth/*` needs the session cookie. Errors always look like `{ "error": { "code", "message" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness and which integrations are configured |
| POST | `/auth/nonce` | `{address}` → `{message, expiresAt}`: the text to sign |
| POST | `/auth/verify` | `{address, message, signature, name?, email?}` → checks the wallet signature, sets the cookie |
| POST | `/auth/signup` | `{email, password, name?}` → creates an email account (password at least 8 characters, stored as a scrypt hash) and sets the cookie. `409 email_taken` if the email has an account |
| POST | `/auth/login` | `{email, password}` → sets the cookie, for email accounts and for wallet accounts that added email sign-in. A wrong password and an unknown email get the same `401` |
| POST | `/auth/password` | Signed in with a wallet: `{email, password}` adds email sign-in to the account, or changes it. Logging in with that email then opens the same wallet account. `409 email_taken` if another account uses the email |
| POST | `/auth/demo` | Creates a fresh demo account with sample data and starts its session (see [Demo accounts](#demo-accounts)) |
| POST | `/auth/logout` | Clears the cookie |
| GET | `/me` | Session user, saved profile (`profile: null` without a database) and `passwordEmail`, the email the account signs in with when it has a password |
| PUT | `/me/profile` | Saves onboarding answers; new goal, limit and payday also become goal/budget rows and memories |
| GET | `/wallet/*` | Refused with `409 no_wallet` for email accounts: their address is only an id that nobody holds keys for |
| GET | `/wallet/balance` | USDC balance at the user's address: `usdc` (exact decimal string) and `amount` (number) |
| GET | `/wallet/transactions?limit=` | Recent USDC transfers in and out (live, not stored) |
| POST | `/wallet/sync` | Imports USDC transfers into `transactions` under the user's "Sui wallet" account and refreshes its balance → `{account, imported, alreadyImported, skipped, pagesRead, complete, balanceStatus}`. Read-only, de-duplicated by digest, safe to repeat. `503` without Tatum, `403 demo_not_supported` for demos |
| GET | `/wallet/deposit` | Address, network, token and coin type for the top-up screen |
| GET | `/memories?kind=` | The user's memories, newest first, excluding forgotten ones |
| POST | `/memories` | `{kind, text, source?}` → remembers something |
| POST | `/memories/recall` | `{query, limit?}` → semantic search over the user's memories |
| DELETE | `/memories/:id` | Forgets a memory (see below) |
| GET | `/accounts` | `{accounts, wallet}`: bank accounts with balance (null when unknown), transaction count and last transaction date; the Sui wallet read live (`status`: `live`, `not_configured`, `unavailable`, `skipped_demo`) |
| GET | `/accounts/summary` | `total` (known balances + live wallet), `banks`, `wallet`, `missing` (what couldn't be counted, never guessed), a 30-day `trend` and `change30d` |
| PATCH | `/accounts/:id` | `{name?, balance?}`; `balance: null` marks it unknown |
| DELETE | `/accounts/:id` | Deletes the account and the transactions imported into it |
| GET | `/transactions?month=&category=&limit=` | Transactions, newest first |
| POST | `/transactions/import?preview=1&dateOrder=dmy` | Multipart `file`: a CSV, an Excel workbook (`.xlsx`: each sheet with a date, description and amount table becomes its own account, found below any title block) or a PDF (its text is read into rows by the AI model; not for demo accounts, and read once for a preview and the import that follows) (+ optional `accountName`). With `preview=1` nothing is saved. When the CSV has a balance column, the balance after its latest row becomes the account balance (`closingBalance` in the preview). On import, merchants without a learned rule are categorized by Groq when configured; the response's `categorizedBy` counts rules, AI and keyword fallbacks |
| PATCH | `/transactions/:id` | `{category, remember}`. With `remember: true` it saves a merchant rule, recategorizes that merchant and writes a memory |
| GET | `/budgets?month=` | Limits with `spent` for the month, `committed` (active recurring charges still expected before the month ends; paused ones and ended months count 0), `projected` (spent + committed) and the `renewals` behind it |
| GET | `/budgets/suggestions` | Limit changes suggested from the last three full months → `{suggestions: [{id, category, label, direction, from, to, text, evidence}]}` (see below) |
| POST | `/budgets/suggestions/:id/accept` | Sets the suggested limit and remembers the decision. `404` if it isn't on offer, `409 already_decided` if already answered |
| POST | `/budgets/suggestions/:id/dismiss` | Keeps the limit; that category and direction isn't suggested again for 90 days |
| PUT | `/budgets/:category` | `{limit}` |
| DELETE | `/budgets/:category` | Removes a limit |
| GET | `/goals` | Savings goals |
| POST | `/goals` | `{name, target, saved?, due, weekly?}` |
| PATCH | `/goals/:id` | Partial update |
| DELETE | `/goals/:id` | Removes a goal |
| GET | `/recurring` | Repeating charges detected from the last 120 days, each with a stable `id`, `status` (`active` or `paused`) and `pausedAt` |
| POST | `/recurring/:id/pause` | Stops Sovra counting the charge in projections, upcoming bills and reminders → `{recurring, changed, memory, note}`. Doesn't cancel anything with the merchant (`note` says so). Repeating it changes nothing |
| POST | `/recurring/:id/resume` | Counts it again |
| POST | `/ask` | `{question}` → `{answer, usedMemories: [{id, text}], model, id, createdAt}`. `503 not_configured` without `GROQ_API_KEY`, `429 rate_limited`, `502 ai_upstream_error`. Answered questions are saved to history (`id` is null without a database) |
| GET | `/ask/history?limit=&before=` | `{messages, nextCursor}`: saved questions and answers, newest first. `limit` 1 to 50 (default 20); pass `nextCursor` as `before` for the next page |
| DELETE | `/ask/history` | Clears the user's Ask history → `{deleted}` |

## Security

**Headers.** Every response, errors and CORS preflights included, gets a deny-all `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, a restrictive `Permissions-Policy` and `Cache-Control: no-store` (responses hold personal financial data). `Strict-Transport-Security` is added when `NODE_ENV=production`. `X-Powered-By` is off.

**Rate limits.** A global guard (`src/security/rate-limit.ts`) counts every request against its IP's global limit. Routes marked `@RateLimit(policy)` also count against a stricter policy:

| Policy | Routes | Keyed by | Default |
| --- | --- | --- | --- |
| `auth` | `POST /auth/nonce`, `POST /auth/verify` (shared) | IP | 20 / minute |
| `demo` | `POST /auth/demo` | IP | 10 / hour |
| `ask` | `POST /ask` (paid AI call) | signed-in user, else IP | 30 / hour |
| `import` | `POST /transactions/import` (may call the AI model) | signed-in user, else IP | 30 / hour |

Going over answers `429 {"error":{"code":"rate_limited"}}` with a `Retry-After` header, before the route does any work. Limits are checked before the file upload is read.

Known limitation: counters live in process memory. Each instance counts separately and counts reset on restart, so with N instances a client can make up to N times a limit. Move the store to Postgres or Redis before scaling out.

**Client IPs and `TRUST_PROXY`.** Per-IP limits use Express's `req.ip`, which reads `X-Forwarded-For` through as many proxies as `TRUST_PROXY` says. Set it to the real number of proxies in front of the API (`1` behind one load balancer, which is the default). If it's higher than reality, clients can send their own `X-Forwarded-For` and pick their IP; if the API is reached directly, set it to `false`.

**Errors.** Malformed JSON (400), bodies over 100 kB (413), CSVs over 5 MB (413), unknown routes (404) and unexpected failures (500, details only in the server log) all use the `{ "error": { "code", "message" } }` shape.

**Authorization.** Every route except `health` and `auth/*` requires the session cookie, and every query filters by the session's address. Integration tests check that one user can't read or change another's transactions, budgets, goals or memories.

## Budget suggestions

`src/budgets/budget-suggestions.ts` applies two fixed rules to each category with a limit, using spending in the last three full calendar months. There's no AI involved, and the response includes the numbers each suggestion is based on (`evidence`).

- **Raise** when spending went over the limit in at least 2 of the 3 months and used at least 80% of it in all 3. The new limit is the median month rounded up to $10.
- **Lower** when spending stayed under 60% of the limit in all 3 months (and wasn't zero). The new limit is the highest month plus 20%, rounded up to $10, never below $10, and only if this month's projected spending (spent + renewals still due) fits under it.

Without transactions going back to the start of the first of those months, there are no suggestions. Ids are `category:direction:to`, so the same data always gives the same ids. Accepting or dismissing stores a decision (`budget_suggestion_decisions`) and a memory, best-effort. A dismissed category and direction stays hidden for 90 days, even if the limit changes.

## Demo accounts

Each `POST /auth/demo` creates a new account for that visitor: a random Sui address nobody can sign in to, `method: "demo"`, and `users.expires_at` set `DEMO_TTL_HOURS` ahead. It's seeded (`src/auth/demo-seed.ts`) with the same story as the frontend demo: Ada's profile, two CSV accounts, about three months of transactions with dates relative to today (so Netflix and Spotify always renew in three days), two learned category rules, six budgets, two goals and seven memories.

- **Isolation.** Demo visitors never share an account, so they can't see or change each other's data. Every route already filters by the session's address.
- **Expiry.** The session cookie and JWT last exactly as long as the account. `SessionGuard` also checks demo sessions against the database on each request, so a demo that has expired or been deleted, or the old shared demo account, gets `401`.
- **Cleanup.** Expired demo accounts are deleted, along with every row they own (`ON DELETE CASCADE`), whenever a new demo starts, and by `npm run demo:cleanup` for a cron job. Cleanup only deletes demo rows that have an expiry. The legacy shared demo row (`0x7b3e…2f9a`, no expiry) is left for a person to delete.
- **No paid calls.** Demo memories are stored only in the local index (`status: "local"`) and recalled with a local word match, so Walrus is never called for a demo. Demo imports use keyword categories, not the AI model. Ask still works for demos, but a per-IP limit (`RATE_LIMIT_DEMO_ASK_PER_HOUR`) applies on top of the per-user one, because every demo is a new user.

## How the integrations work

**Sign-in (Sui wallet).** The frontend connects a Sui wallet. To prove the address to this server, it asks `/auth/nonce` for a challenge, signs that exact string with `signPersonalMessage`, and posts it to `/auth/verify`. The server checks the signature with `verifyPersonalMessageSignature` from `@mysten/sui/verify`, passing a Sui GraphQL client so zkLogin-based wallets (which are verified on-chain) work too. Nonces are single-use and expire after five minutes. Signed-in wallet users are stored with `method: "google"`, a name left from the earlier zkLogin sign-in.

**Tatum.** Tatum's Sui mainnet gateway currently exposes GraphQL at `https://sui-mainnet.gateway.tatum.io/graphql`; its `/_methods` list shows no JSON-RPC. Balances use the `@mysten/sui` GraphQL client's `core.getBalance`. Transfers come from a `transactions(filter: { affectedAddress })` query, reduced to USDC balance changes. USDC is Circle's native coin type `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`. Without a Tatum key, sign-in verification falls back to the public `graphql.mainnet.sui.io` endpoint.

**Sui sync.** `POST /wallet/sync` (`src/wallet/wallet-sync.service.ts`) pages backwards through `transactions(last: 50, before:, filter: { affectedAddress })` and stores each successful USDC movement as a transaction on the user's single `sui` account (a partial unique index allows only one). Amounts are signed dollars (USDC is treated as USD, rounded to cents; transfers under half a cent are skipped), the date is the checkpoint timestamp's UTC day, and the merchant is the counterparty (`USDC to 0x1a1a…1a1a`) with merchant key `sui:<address>`, so learned category rules and recurring detection work per counterparty. Without a rule, money in is `income` and money out is `transfer`. The digest is stored as `external_id`, unique per user, so repeated or concurrent syncs never duplicate a transfer. A sync stops paging when it reaches transfers it already has. If it runs out of pages first (`WALLET_SYNC_MAX_PAGES`), it saves the cursor in `accounts.sync_pending` and the next sync continues from there, so long histories arrive over several syncs without gaps. Failed transactions and transactions without a timestamp are skipped. Nothing is ever signed or sent. The Sui account's currency is always USD. Once it exists, `/accounts/summary` counts its live balance, or the last synced balance if Tatum is unavailable, once, converted to the user's currency like any other account. Tested against a fake GraphQL endpoint; the `pageInfo`/`before` paging hasn't yet been checked against Tatum's live gateway.

**Walrus Memory.** One app account; each user gets the namespace `sovra-<address>`. Memories are sent as `[sovra:<kind>] <text>`, so recall results carry their kind. The relayer encrypts and stores each memory on Walrus. `remember` returns once the relayer accepts the job, and the upload finishes in the background (`status` goes `pending` → `stored` or `failed`).

The SDK's `listMemories` returns metadata without text, and the SDK has no delete. So every memory is also indexed in the `memories` table: text, kind, blob id, use count and a `forgotten_at` flag. **Forgetting hides a memory from lists and recall. It does not delete the encrypted blob on Walrus, which stays until its storage period ends.** The privacy policy says the same.

**AI (Groq).** `src/ai/groq.provider.ts` calls Groq's OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions` with plain `fetch`, a Bearer key and a 30-second timeout. The defaults are Groq production models on the developer plan: `openai/gpt-oss-120b` for answers (reasoning effort medium) and `openai/gpt-oss-20b` for categorization (low). Both run with `include_reasoning: false` so only the final text comes back. Groq 429 and 498 become `429 rate_limited`; anything else, including a bad key, becomes `502 ai_upstream_error` with a safe message, and the details go to the server log.

- **Ask.** `AskService` gathers whatever is available: recalled memories (their use count goes up), the profile, this month's budgets, goals, the 15 latest transactions this month, bills due in the next 30 days, and the Sui USDC balance. Each source is optional. Anything missing is listed in the prompt so the model says so instead of guessing. The system prompt keeps Sovra read-only, plain-spoken, grounded in the given numbers, and away from investment, tax or legal advice.
- **Categorization.** On import (not preview), merchants without a learned rule are deduplicated by merchant key and sent in batches of 60, up to 300 per import. Groq's strict `json_schema` mode limits answers to the category list, and zod checks them again. Any failed batch keeps the keyword guess or `uncategorized`.

To change vendors, implement `AiProvider` (`src/ai/ai.provider.ts`) and bind it in `AiModule`.

## Layout

```
src/
  main.ts                 bootstrap
  app.setup.ts            /api prefix, cookies, CORS, error filter (shared with tests)
  app.module.ts
  health.controller.ts
  config/                 zod-validated env (ENV token)
  database/               Drizzle schema + DatabaseService (503 when no DATABASE_URL)
  common/                 AppError helpers, exception filter, ZodPipe
  security/               rate limiting guard and security headers
  shared/                 categories, merchant keys, memory sentences
  auth/                   nonce/verify/demo/logout, SessionGuard, @CurrentSession
  wallet/                 TatumService (Sui GraphQL via Tatum), wallet routes
  memory/                 MemwalService (Walrus Memory + local index), memory routes
  ai/                     AiProvider interface + Groq implementation
  me/                     profile and onboarding
  transactions/           CSV import (CsvService), list, recategorize with learned rules
  ask/                    grounded Q&A over the user's data and memories
  accounts/               account list, edits, totals and 30-day trend
  budgets/ goals/ recurring/
  e2e/                    integration tests against the real app
  testing/                test helpers and fakes (not part of the build)
drizzle/                  SQL migrations
```

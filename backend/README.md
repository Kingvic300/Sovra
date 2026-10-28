# Sovra backend

NestJS API for Sovra. It verifies zkLogin sign-ins, reads USDC on Sui through Tatum, stores what Sovra learns in Walrus Memory, answers questions with Groq, and keeps transactions, budgets and goals in Postgres.

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
- Groq, Walrus Memory and Tatum are never called. `src/testing/` has fakes (`FakeAi`, `FakeMemWal`) and helpers: `createTestApp`, `createTestDatabase`, and `signIn`, which runs the real nonce + signature flow with an Ed25519 key (verified offline, same code path as zkLogin).

CI (`.github/workflows/ci.yml`) runs typecheck, build and tests for the backend, and lint and build for the frontend, on every pull request and push to `main`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | Signs the session cookie. At least 16 characters. |
| `PORT` | no | Defaults to `8787`. |
| `FRONTEND_ORIGIN` | no | CORS origin allowed with credentials. Defaults to `http://localhost:5173`. |
| `NODE_ENV` | no | `production` makes the cookie `Secure`. |
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
| POST | `/auth/verify` | `{address, message, signature, name?, email?}` → checks the zkLogin signature, sets the cookie |
| POST | `/auth/demo` | Starts a session for the demo account |
| POST | `/auth/logout` | Clears the cookie |
| GET | `/me` | Session user and saved profile (`profile: null` without a database) |
| PUT | `/me/profile` | Saves onboarding answers; new goal, limit and payday also become goal/budget rows and memories |
| GET | `/wallet/balance` | USDC balance at the user's address |
| GET | `/wallet/transactions?limit=` | Recent USDC transfers in and out |
| GET | `/wallet/deposit` | Address, network, token and coin type for the top-up screen |
| GET | `/memories?kind=` | The user's memories, newest first, excluding forgotten ones |
| POST | `/memories` | `{kind, text, source?}` → remembers something |
| POST | `/memories/recall` | `{query, limit?}` → semantic search over the user's memories |
| DELETE | `/memories/:id` | Forgets a memory (see below) |
| GET | `/transactions?month=&category=&limit=` | Transactions, newest first |
| POST | `/transactions/import?preview=1&dateOrder=dmy` | Multipart CSV `file` (+ optional `accountName`). With `preview=1` nothing is saved. On import, merchants without a learned rule are categorized by Groq when configured; the response's `categorizedBy` counts rules, AI and keyword fallbacks |
| PATCH | `/transactions/:id` | `{category, remember}`. With `remember: true` it saves a merchant rule, recategorizes that merchant and writes a memory |
| GET | `/budgets?month=` | Limits with spending for the month |
| PUT | `/budgets/:category` | `{limit}` |
| DELETE | `/budgets/:category` | Removes a limit |
| GET | `/goals` | Savings goals |
| POST | `/goals` | `{name, target, saved?, due, weekly?}` |
| PATCH | `/goals/:id` | Partial update |
| DELETE | `/goals/:id` | Removes a goal |
| GET | `/recurring` | Repeating charges detected from the last 120 days |
| POST | `/ask` | `{question}` → `{answer, usedMemories: [{id, text}], model}`. `503 not_configured` without `GROQ_API_KEY`, `429 rate_limited`, `502 ai_upstream_error` |

## How the integrations work

**Sign-in (zkLogin).** The frontend signs in with Google through Enoki, which gives the user a Sui address. To prove it to this server, the frontend asks `/auth/nonce` for a challenge, signs that exact string with `signPersonalMessage`, and posts it to `/auth/verify`. The server checks the signature with `verifyPersonalMessageSignature` from `@mysten/sui/verify`, passing a Sui GraphQL client, because zkLogin signatures are verified on-chain. Nonces are single-use and expire after five minutes.

**Tatum.** Tatum's Sui mainnet gateway currently exposes GraphQL at `https://sui-mainnet.gateway.tatum.io/graphql`; its `/_methods` list shows no JSON-RPC. Balances use the `@mysten/sui` GraphQL client's `core.getBalance`. Transfers come from a `transactions(filter: { affectedAddress })` query, reduced to USDC balance changes. USDC is Circle's native coin type `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`. Without a Tatum key, sign-in verification falls back to the public `graphql.mainnet.sui.io` endpoint.

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
  shared/                 categories, merchant keys, memory sentences
  auth/                   nonce/verify/demo/logout, SessionGuard, @CurrentSession
  wallet/                 TatumService (Sui GraphQL via Tatum), wallet routes
  memory/                 MemwalService (Walrus Memory + local index), memory routes
  ai/                     AiProvider interface + Groq implementation
  me/                     profile and onboarding
  transactions/           CSV import (CsvService), list, recategorize with learned rules
  ask/                    grounded Q&A over the user's data and memories
  budgets/ goals/ recurring/
  e2e/                    integration tests against the real app
  testing/                test helpers and fakes (not part of the build)
drizzle/                  SQL migrations
```

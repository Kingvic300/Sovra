# End-to-end checks

How to check that the frontend and backend work together, and what the last run found.

## Setup

```bash
docker compose up --build          # Postgres + API on :8787, migrations applied
npm run dev:frontend               # http://localhost:5173, proxies /api to :8787
```

Use a fresh demo account (**Explore with a demo account** on `/signin`) or a new email account. Watch the browser's network panel: every change below should send a request to `/api/...` and get a 2xx response.

## Checklist

| Area | Steps | Expected |
| --- | --- | --- |
| Demo sign-in | `/signin` → Explore with a demo account | `POST /api/auth/demo` 200. Overview shows Ada's data from the backend. `GET /api/me` has `method: "demo"` |
| Email sign-up | `/signup` with email and password, then finish onboarding | `POST /api/auth/signup` 201, `PUT /api/me/profile` 200. Screens are empty, never the sample story |
| Statement import | Accounts → drop a CSV → preview → import. Then import the same file again | Preview first, then rows saved. The second import says nothing new to import |
| Transactions | Change a category, then "remember" it for the merchant | `PATCH /api/transactions/:id` 200. Every row for that merchant moves, and a memory appears |
| Budgets | Add a budget, change a limit | `PUT /api/budgets/:category` 200. Still there after a reload |
| Budget suggestions | Budgets page with three full months of history over or well under a limit | Cards come from `GET /api/budgets/suggestions`. Change sets the limit (`POST .../accept`), Keep dismisses it (`POST .../dismiss`). After a reload the card is gone, and Memory has the decision |
| Goals | Add and remove a goal | `POST /api/goals` 201, `DELETE /api/goals/:id` 204 |
| Recurring | Pause a charge, reload, resume it | `POST /api/recurring/:id/pause` then `/resume`, both 200. After the reload the charge still shows Paused. The decision is in Memory |
| Reminders | Open the bell | Items come from `GET /api/reminders`. Dismissing one (`POST /api/reminders/:id/dismiss`) removes it for good. Pausing a charge resolves its renewal reminder |
| Memory | Forget a memory, then undo | `DELETE /api/memories/:id`, then `POST /api/memories` |
| Ask | Ask "Can I afford a $50 dinner?" | `POST /api/ask` 200. The answer uses balances and memories. History is still there after a reload |
| Errors | Stop the backend and make a change | An error toast in the usual style. With an expired session (`401`), the app returns to sign-in |
| Export | Profile → Your data → Download my data | A `sovra-export-<date>.json` file with `format: "sovra-export"` |
| Delete | Profile → Delete account → type `delete` | `DELETE /api/me` 200. Signed out, `GET /api/me` answers 401, and `/app` redirects to sign-in |

## Last run: 30 October 2026

The run used the local Docker stack (`docker compose up`, Postgres 17), the Vite dev server, and a headless Chromium driven by Playwright. Integrations had real keys from `backend/.env`.

| Check | Result |
| --- | --- |
| Demo sign-in | Pass. `POST /api/auth/demo` 200, and the session is a per-visitor demo address |
| Recurring pause, reload, resume | Pass. The server status went `active` → `paused` → `active`, and the button read Resume after the reload |
| Reminders in the bell | Pass. The bell listed the server's two reminders (Netflix and Spotify renewals) with dismiss buttons. Dismissing Netflix removed it on the server |
| Budget suggestions | Pass, with an email account that had four months of $200/month transport spending and a $150 limit. The card offered $150 → $200. Accepting set the server limit to $200, the suggestion list emptied, and the backend wrote the decision memory. The demo account has no suggestions: its history is shorter than three full months |
| Export | Pass. The file had 11 tables and the demo's 48 transactions |
| Delete | Pass after a fix. The first run sent the browser's sample demo address as confirmation and got `400 confirmation_mismatch`. The confirmation now comes from `GET /api/me`. After that, `DELETE /api/me` returned 200, then `POST /api/auth/logout`, then `GET /api/me` returned 401, and `/app` redirected to `/signin` |
| Session ended elsewhere (401) | Pass. A demo account was deleted on the server while its page was open. The next change (Pause) got 401, the app signed out with "Your session ended", and it landed on `/signin` |
| Frontend lint and build | Pass |
| Backend tests | 257/257 pass |

Not covered in this run: Sui wallet sign-in (needs a real wallet extension), PDF statement import, and the deployed Vercel + Render setup (see the checklist in [DEPLOYMENT.md](../DEPLOYMENT.md#checking-a-deployment)).

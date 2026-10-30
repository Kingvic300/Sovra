# Deploying Sovra

Sovra has two parts:

- **Frontend:** a static Vite build on Vercel (`frontend/`, configured by `frontend/vercel.json`).
- **Backend:** the NestJS API in a Docker image (`backend/Dockerfile`), on Render (`https://sovra-xck3.onrender.com`) or any host that runs containers, with a managed Postgres such as Neon.

The browser only ever talks to the Vercel domain. Vercel rewrites `/api/*` to the backend, so the session cookie is first-party and `SameSite=Lax` works without any cross-site cookie settings.

```
browser ──> https://<app>.vercel.app/*      static files, index.html for app routes
        └─> https://<app>.vercel.app/api/*  ──rewrite──> https://<backend>/api/*  ──> Postgres
```

## Local stack with Docker

```bash
docker compose up --build          # Postgres + API on :8787
curl localhost:8787/api/health     # {"status":"ok","services":{"database":true,...}}
npm run dev:frontend               # http://localhost:5173, proxies /api to :8787
```

Compose starts Postgres 17, waits for it to be ready, then starts the API. The API container applies the migrations before it starts serving. API keys are read from `backend/.env` when it exists; `docker-compose.yml` overrides `DATABASE_URL`, `NODE_ENV`, `FRONTEND_ORIGIN` and `TRUST_PROXY` for local use. `docker compose down -v` deletes the local database.

## The backend image

```bash
cd backend
docker build -t sovra-backend .
docker run --rm -p 8787:8787 --env-file .env sovra-backend
```

- **Multi-stage, Node 24.** The final stage has the compiled `dist/`, the `drizzle/` migrations and production dependencies only. No dev dependencies, no `src/`.
- **No secrets.** `.dockerignore` excludes every `.env*` file. All configuration comes from environment variables at run time.
- **Non-root.** The server runs as the `node` user (uid 1000). Application files are owned by root, so the process can't change them.
- **Health check.** The image checks `GET /api/health` every 30 seconds. Point the platform's health check at `/api/health` too.

## Migrations

`node dist/scripts/migrate.js` (or `npm run migrate` after a build) applies the SQL in `backend/drizzle/` with drizzle-orm's migrator, so the image doesn't need `drizzle-kit`. It records applied migrations in `drizzle.__drizzle_migrations`, the same table `npm run db:migrate` uses, so both work on the same database.

The container runs migrations every time it starts, before the server begins taking requests. If they fail, the container exits and the old version keeps serving. A Postgres advisory lock makes instances that start together take turns: the first applies the migrations and the others find nothing to do. Without `DATABASE_URL`, the step is skipped and data routes answer 503.

To run migrations as a separate pre-deploy step instead (Render's **Pre-Deploy Command**, for example), set that command to `node dist/scripts/migrate.js` and set `RUN_MIGRATIONS=false` on the service.

New migrations come from `npm run db:generate` in development. Commit the generated SQL and `drizzle/meta/`. Write migrations so the running version still works against the new schema (add columns, don't rename them in one step), because the old version keeps serving while the new one starts.

## Backend environment

The full list is in [`backend/.env.example`](backend/.env.example) and [`backend/README.md`](backend/README.md#environment). For a deployment:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (the image sets it). Makes the cookie `Secure` and adds HSTS |
| `SESSION_SECRET` | `openssl rand -hex 32`. Changing it signs everyone out |
| `DATABASE_URL` | Postgres connection string. For Neon, the pooled connection string with `sslmode=require` |
| `FRONTEND_ORIGIN` | The frontend's origin, e.g. `https://sovra.vercel.app`. Allowed by CORS with credentials |
| `TRUST_PROXY` | Number of proxies in front of the API (see below) |
| `CRON_SECRET` | `openssl rand -hex 32`, for the scheduled jobs endpoint |
| `PORT` | Set by most platforms; the image defaults to `8787` |
| `GROQ_API_KEY`, `TATUM_API_KEY`, `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID` | As needed. Missing keys turn their routes into `503 not_configured` |

Never set these on Vercel: anything in the frontend build is public.

### CORS, cookies and `trust proxy`

- **CORS.** Requests through the Vercel rewrite are same-origin for the browser, so CORS doesn't come into play for the app. `FRONTEND_ORIGIN` still has to be the frontend's real origin for any direct cross-origin call.
- **Cookie.** `sovra_session` is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `NODE_ENV=production`. It has no `Domain`, so the browser stores it for the Vercel domain it was received on. That only works because the browser never calls the backend's own domain. Don't point the frontend at the backend URL directly.
- **`TRUST_PROXY`.** Rate limits are per client IP, read from `X-Forwarded-For` through as many proxies as this says. Render's load balancer is one proxy. The Vercel rewrite is another, so requests from the app pass through two. With `1`, the API would see Vercel's address and every user would share one rate-limit bucket. With `2`, anyone who calls the Render URL directly can choose their own IP with a fake `X-Forwarded-For` header. Pick `2` for the deployed app, and check it: sign in, then confirm in the backend logs (or with a temporary log of `req.ip`) that the IP is the client's and not Vercel's. Use `false` only when clients connect to the API with no proxy at all.

## Frontend on Vercel

- Root directory `frontend`, framework Vite, build `npm run build`, output `dist`.
- `frontend/vercel.json` rewrites `/api/:path*` to the backend and every other path to `index.html`. If the backend URL changes, change it there.
- The security headers in `vercel.json` apply to everything except `/api/`. API responses keep the backend's own headers.
- No environment variables are needed.

## Scheduled jobs

Expired demo accounts and reminders are refreshed by `POST /api/internal/jobs/run` with `Authorization: Bearer <CRON_SECRET>` (details in [`backend/README.md`](backend/README.md#reminders-and-scheduled-jobs)). Any one of these is enough:

- **GitHub Actions.** `.github/workflows/jobs.yml` calls the endpoint every hour. Add the repository secrets `SOVRA_API_URL` (for example `https://sovra-xck3.onrender.com`, no trailing slash) and `CRON_SECRET`. Until both exist, the workflow skips.
- **Render Cron Job** with the same image and the command `node dist/scripts/run-jobs.js`.
- **Always-on host:** `JOBS_INTERVAL_MINUTES=60` runs the jobs inside the API process.

The job is idempotent, so running it from more than one place is harmless.

## Checking a deployment

1. `GET https://<backend>/api/health` answers 200 with `"database": true` and the integrations you configured set to `true`.
2. `GET https://<frontend>/api/health` gives the same answer through the rewrite.
3. On the frontend, choose **Explore with a demo account**. In the browser's dev tools, the `sovra_session` cookie is set on the frontend's domain with `Secure` and `HttpOnly`.
4. Reload the page. You're still signed in, and Overview shows the demo story from the backend.
5. Sign out. The cookie is gone and `/app` sends you back to sign-in.
6. Run the jobs once (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<backend>/api/internal/jobs/run`) and check for a 200 with counts.

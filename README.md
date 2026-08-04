# Provider Tariff Negotiation Tracker

Leadway Health internal tool for logging provider tariff negotiation requests, tracking
delay time, updating negotiation outcomes, and notifying members when care may be delayed.

- **Framework:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database:** PostgreSQL via Prisma
- **Auth:** Staff sign in with their real Prognosis (`prognosis-api.leadwayhealth.com`) username/password.
  A dedicated service account is used in the background to send member notifications.
- **Notifications:** Sent through Prognosis's own `EnrolleeProfile/SendEmailAlert` (email) and
  `Sms/SendSms` (SMS) endpoints — no separate SMTP/Twilio account needed.

## Roles

| Role | Access |
|---|---|
| **Admin** | Everything, plus Configuration (assign roles) |
| **Contact Centre** | Dashboard, Log Negotiation, Completed Negotiations, Reports, Tariff Review Insights |
| **Provider Team** | Dashboard, Open Negotiations (queue), Completed Negotiations, Reports, Tariff Review Insights |
| **Pending** | Nothing until an Admin assigns a role (shown a waiting screen) |

The **first** person(s) who should become Admin are listed by Prognosis username in the
`ADMIN_USERNAMES` environment variable (comma-separated) — they're auto-promoted to Admin
the first time they sign in. Everyone else starts as *Pending* until an Admin assigns them
a role from the **Configuration** page. Role changes take effect the next time that person
signs in.

## 1. Create a Neon Postgres database

1. Go to [neon.tech](https://neon.tech) and create a free project.
2. Copy the connection string it gives you (starts with `postgresql://...?sslmode=require`).
   This is your `DATABASE_URL`.

## 2. Create the Render Web Service

1. Push this repository to GitHub (already done if you're reading this on the deployed branch).
2. In the [Render dashboard](https://dashboard.render.com), click **New +** → **Web Service**,
   and connect this repository.
3. Configure:
   - **Environment:** Node
   - **Node version:** 20.9 or later — required by Next.js 16 (`package.json`'s `engines.node`
     documents this; if Render's default image is older, set `NODE_VERSION` under Environment
     variables, or add a `.node-version` file pinning it).
   - **Build Command:** `npm install && npm run build:deploy`
   - **Start Command:** `npm run start`

   `build:deploy` runs `prisma migrate deploy` **and** `next build` in one
   script, deliberately. Configuring them as two separate things is how this
   broke once already: the build command ran only the migration, so the
   database advanced while the compiled app went stale, and every page that
   reads a full case row started 500ing on columns that existed in the code but
   not yet in the schema. Keeping them in one script means they can't be set
   apart.

   Migrations run at build rather than at startup on purpose. If a migration
   fails, the deploy fails and Render keeps the previous version serving. Put
   the same command in `start` and a transient database blip stops the app
   booting at all, even when the schema is already correct.
   - **Health Check Path:** `/api/health` — returns 503 when the database schema
     is behind the deployed code, so a bad deploy is caught instead of silently
     500ing every page that reads a case.
   - **Instance Type:** Starter is fine to begin with.
4. Add the environment variables below under **Environment**.
5. Click **Create Web Service**. Render will install dependencies, run the Prisma migration
   against your Neon database, build the Next.js app, and start it.

### Environment variables to set on Render

| Variable | Value |
|---|---|
| `DATABASE_URL` | Pooled connection, used by the running app. On Supabase use the pooler in **transaction** mode (port `6543`) with `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | *Optional.* **Direct, non-pooled** connection, used only by `prisma migrate`. If unset, the migrate script derives it from `DATABASE_URL` for Supabase, and otherwise falls back to `DATABASE_URL`. Supabase: Project Settings → Database → Connection string → "Direct connection". Migrations hold a session and take advisory locks, which a pooler breaks — run them through Supabase's session-mode pooler (port `5432`) and they fail with `FATAL: (EMAXCONNSESSION) max clients reached in session mode`. If your Supabase project has no IPv4 direct endpoint, point this at the session-mode pooler and lower `DATABASE_URL`'s `connection_limit` so the app leaves clients free for the migration |
| `NEXTAUTH_URL` | Your Render service URL, e.g. `https://tariff-negotiation-tracker.onrender.com` — used to build links in emails and to validate the CORS allow-list, not for session auth (sessions are a database-backed opaque token now, not a signed/encrypted cookie, so there's no secret to configure for them) |
| `PROGNOSIS_BASE` | `https://prognosis-api.leadwayhealth.com` (default, only override if it changes) |
| `PROGNOSIS_SERVICE_USERNAME` | A Prognosis username dedicated to sending member notifications |
| `PROGNOSIS_SERVICE_PASSWORD` | That account's password |
| `ADMIN_USERNAMES` | Your own Prognosis username (comma-separate more than one) |

The `PROGNOSIS_SERVICE_USERNAME`/`PASSWORD` account can be the same one you personally sign in
with, or a separate shared account created for this app — either works, since it's only used
server-side to call `SendEmailAlert`/`SendSms`, never for signing in through the login page.

## 3. First login

1. Visit your Render URL and sign in with the Prognosis username listed in `ADMIN_USERNAMES`.
2. You'll land on the Dashboard as an Admin.
3. Go to **Configuration** to assign **Contact Centre** or **Provider Team** roles to your
   colleagues as they sign in for the first time (they'll see a "waiting for role" screen
   until you do).

## Local development

```bash
cp .env.example .env   # fill in DATABASE_URL etc. — a local Postgres works fine for dev
npm install
npm run db:migrate:deploy   # or: npx prisma migrate dev
npm run dev
```

## Notes / known follow-ups

- Upgraded to Next.js 16.2.10 + React 19 (from 14.2.35 / React 18) specifically to clear
  a High-severity `npm audit` advisory on `next` that had no fix on the 14.x line — several
  of the underlying CVEs (RSC DoS/cache-poisoning, middleware-redirect cache-poisoning) were
  architecturally applicable to this app (App Router + middleware redirects), not just
  theoretical. Also bumped `next-auth` to `5.0.0-beta.31`, clearing a separate low-severity
  `cookie` advisory. The `middleware.ts` file was renamed to `proxy.ts` (Next 16 deprecated
  the old convention). `npm audit` now reports one remaining moderate advisory: a `postcss`
  version bundled *inside* `next`'s own `node_modules` (not this project's own Tailwind
  pipeline, which is already on a patched postcss) — it's Next.js's own internal build
  tooling dependency, not reachable by any runtime request this app handles, and not
  something `npm overrides` can reach past Next's own nested resolution. Re-check on the
  next `next` patch release.
  Verified: clean `tsc --noEmit` and `next build` (all 19 routes). Not independently
  smoke-tested end-to-end against live Prognosis/a real database from this environment —
  do a full manual pass through login, case logging, and the provider-team queue after
  deploying this before treating it as fully verified in production.
- Role changes made in Configuration apply on the affected user's *next* sign-in, not
  instantly — this keeps the middleware edge-runtime-safe (Prisma can't run there); the
  same constraint is why `configuration/page.tsx` and `negotiations/new/page.tsx` enforce
  their own role checks directly rather than relying on the middleware for it.
- Sessions are database-backed: the cookie holds only an opaque, unchanging token (see
  `src/lib/session.ts`), hashed and looked up against a `Session` row. Idle timeout is 15
  minutes, as a rolling window entirely server-side — active use extends `expiresAt` in
  place (throttled to at most once every 5 minutes), so the cookie itself is written once
  at login and never rewritten again for the life of the session. The middleware
  (`src/proxy.ts`) only checks for the cookie's presence, not its validity — that's the
  real authorization boundary, enforced by every page/Server Action/API route calling
  `auth()` in the Node.js runtime.

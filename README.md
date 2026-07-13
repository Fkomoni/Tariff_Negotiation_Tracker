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
   - **Build Command:** `npm install && npm run db:migrate:deploy`
   - **Start Command:** `npm run start`
   - **Instance Type:** Starter is fine to begin with.
4. Add the environment variables below under **Environment**.
5. Click **Create Web Service**. Render will install dependencies, run the Prisma migration
   against your Neon database, build the Next.js app, and start it.

### Environment variables to set on Render

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Neon/Supabase connection string from step 1. If it's a pooled connection (e.g. Supabase's session pooler) with a small `pool_size`, add `?connection_limit=5` (or lower) to the URL so this app doesn't consume the whole pool by itself |
| `NEXTAUTH_SECRET` | A random secret — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your Render service URL, e.g. `https://tariff-negotiation-tracker.onrender.com` |
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

- `npm audit` flags several advisories against the `next@14.2.x` line (mostly around
  `next/image`, i18n Pages Router, and WebSocket upgrades — none of which this app uses).
  A move to Next 15/16 would clear them but is a breaking change; worth scheduling as a
  deliberate upgrade rather than doing it under this MVP.
- Role changes made in Configuration apply on the affected user's *next* sign-in, not
  instantly — this keeps the middleware edge-runtime-safe (Prisma can't run there).
- Sessions expire after 12 hours (or after 12h of inactivity — active use refreshes it
  hourly); see `session.maxAge`/`updateAge` in `src/lib/auth.ts`.
- Auth.js is configured with `trustHost: true`, which is required on Render (and most
  non-Vercel platforms) — without it, every request fails with an `UntrustedHost` error,
  because Auth.js needs the incoming `Host`/`X-Forwarded-Host` header to construct its own
  callback URLs even when `NEXTAUTH_URL` is set. This app never derives trust decisions or
  absolute URLs from the request Host itself (notification emails use the explicit
  `NEXTAUTH_URL` env var, not a request-derived host), so the residual risk is scoped to
  whatever Auth.js does internally with that header. Render's own edge routes by the
  service's assigned hostname rather than trusting an arbitrary client-supplied `Host`, but
  if this ever moves behind a different reverse proxy, confirm that proxy validates/strips
  inbound `Host`/`X-Forwarded-Host` from external clients before forwarding.

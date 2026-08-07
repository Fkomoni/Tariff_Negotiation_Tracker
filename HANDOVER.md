# Deployment Handover - Provider Tariff Negotiation Tracker

For the IT team taking this app to Huawei Cloud. It explains what the app is,
how to run it well, how to set up the database and make it load fast, and the
checklist to clear before go-live.

The current README documents the original Render + Supabase setup. This file is
the cloud-agnostic version and the Huawei-specific guidance.

---

## 1. What the app is

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind, Prisma ORM,
  PostgreSQL. One server process. No microservices.
- **Auth:** staff sign in with their real Prognosis credentials; sessions are a
  database-backed opaque cookie (no JWT). MFA (email OTP) is mandatory.
- **Upstream:** it reads providers/enrollees/tariffs from, and pushes price
  updates to, the **Prognosis API**. It also sends member email/SMS through
  Prognosis. Nothing else is external.
- **Data it holds:** enrollee PII (names, contact, DOB-derived age), provider
  tariff prices, negotiation cases, staff accounts and sessions, an audit log.

The only stateful dependencies are **PostgreSQL** and **the Prognosis API**.
Everything else is stateless and horizontally scalable.

---

## 2. Recommended Huawei architecture

| Concern | Huawei service | Notes |
|---|---|---|
| App runtime | **CCE** (Kubernetes) or a single **ECS** with Docker | Container image is provided (see the `Dockerfile`). Start with one ECS if the team is small; move to CCE for HA. |
| Database | **RDS for PostgreSQL** (managed) | PostgreSQL 14 or newer. Enable automated backups and, ideally, a standby for HA. |
| Load balancer / TLS | **ELB** | Terminate HTTPS here, forward to the app on port 3000. |
| Container registry | **SWR** | Push the built image here for CCE/ECS to pull. |
| Logs and metrics | **LTS + AOM** | The app has no built-in monitoring; wire stdout/stderr to LTS and set an alert on error rate. This closes a real gap (see section 8). |
| Scheduled job | **CCE CronJob** or an ECS cron | For the daily price-reversion task (section 6). |
| File attachments (optional, later) | **OBS** | Today attachments are small blobs stored in Postgres, which is fine at low volume. Only move to OBS if attachment volume grows. |

Put the app and RDS in the **same region and VPC**. This is the single biggest
performance win over the old setup, where the app and database were in different
providers and every query paid cross-network latency.

---

## 3. Database: what to keep, what to improve

**Keep the schema as-is.** The table design is sound and normalized, with the
right indexes already in place (`prisma/schema.prisma`). It does not need
restructuring. Do NOT hand-edit tables; the schema is owned by Prisma migrations
in `prisma/migrations/`, which are applied automatically (section 5).

**What to actually improve is the database platform and its configuration:**

1. **Use managed RDS for PostgreSQL**, not a self-run container, so you get
   automated backups, point-in-time recovery, and patching.
2. **Turn on automated backups from day one.** This is non-negotiable for a
   tool holding enrollee PII. The prior setup had none.
3. **Connection pooling.** The app supports two URLs:
   - `DATABASE_URL` - the pooled connection the running app uses.
   - `DIRECT_URL` - a direct (non-pooled) connection used only by migrations,
     because migrations take advisory locks that a transaction pooler breaks.

   On RDS you can point both at the same instance to start. If you add a pooler
   (PgBouncer or RDS's built-in), point `DATABASE_URL` at the pooler and
   `DIRECT_URL` at the direct endpoint. Keep the app's pool small
   (`?connection_limit=5` on `DATABASE_URL`) so migrations and other clients are
   never starved. (The whole class of "max clients reached" problems in the old
   setup came from getting this split wrong.)
4. **Size:** this is a low-traffic internal tool. The smallest production RDS
   class is plenty to start; scale on observed load, not up front.

---

## 4. Environment variables

Set these on the app (ECS/CCE). See `.env.example` for the annotated list.

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres URL the app uses. |
| `DIRECT_URL` | recommended | Direct (non-pooled) URL for migrations. If unset it falls back to `DATABASE_URL`, which is fine when there is no pooler. |
| `NEXTAUTH_URL` | yes | The app's public URL, e.g. `https://tariff.leadwayhealth.com`. Used to build links in member emails and to validate the CORS allow-list. |
| `PROGNOSIS_BASE` | yes | `https://prognosis-api.leadwayhealth.com` (override only if it changes). |
| `PROGNOSIS_SERVICE_USERNAME` | yes | Prognosis account used server-side for lookups and to send member email/SMS. |
| `PROGNOSIS_SERVICE_PASSWORD` | yes | That account's password. |
| `ADMIN_USERNAMES` | yes | Comma-separated Prognosis usernames auto-promoted to Admin on first sign-in. |
| `MFA_HASH_SECRET` | recommended | `openssl rand -hex 32`. HMACs the login OTP at rest. Login works without it, but set it. Keep it stable. |
| `REVERT_TASK_TOKEN` | if using the cron | `openssl rand -hex 32`. Bearer token for the daily reversion endpoint (section 6). Must match the value on the cron job. |
| `ENABLE_DEBUG_ROUTES` | no | Leave unset in production. The `/api/debug/*` routes return 404 unless this is `"true"`. |

Store secrets in Huawei's secret management, not in plain env where avoidable.

---

## 5. Build, migrate, run

Node 20.9+ is required (see `package.json` `engines`).

**Option A - container (recommended).** A production `Dockerfile` is included.
It builds Next.js in standalone mode (a small self-contained server) and runs
migrations at container start via `docker-entrypoint.sh`.

```bash
docker build -t <swr-registry>/tariff-tracker:<tag> .
docker push <swr-registry>/tariff-tracker:<tag>
# then run on ECS, or deploy to CCE with the env vars from section 4
docker run -p 3000:3000 --env-file prod.env <swr-registry>/tariff-tracker:<tag>
```

The entrypoint runs `prisma migrate deploy` and, only if it succeeds, starts the
server. If a migration fails the container exits non-zero and does not serve, so
the orchestrator keeps the previous version live instead of booting a build
whose schema is behind its code.

On **CCE**, the cleaner pattern is to run migrations as a one-off **Job or init
container** and set `RUN_MIGRATIONS=false` on the app container so only the Job
migrates. Either approach works; inline is simpler for a single ECS host.

**Option B - direct Node** (no container): `npm ci && npm run build:deploy && npm run start`.
`build:deploy` runs the migration and the build together on purpose.

**Health check:** point ELB and the container health probe at `/api/health`. It
returns 200 when healthy and 503 when the database is unreachable or the schema
is behind the code, so a bad deploy is caught instead of silently serving errors.

---

## 6. The daily price-reversion job

When a negotiated price is given an end date, the app schedules the former price
to take over on that date. A daily sweep is the safety net for any that did not
get scheduled at completion. Set `REVERT_TASK_TOKEN` on the app, then create a
CCE CronJob (or ECS cron) that runs once a day:

```bash
curl -fsS -X POST -H "Authorization: Bearer $REVERT_TASK_TOKEN" \
  https://<app-url>/api/tasks/revert-due-tariffs
```

If you do not set this up, the per-case "Revert now" button still works
manually; the cron just automates it.

---

## 7. Making it load fast on Huawei

1. **Co-locate app and RDS in one region/VPC.** Biggest single win.
2. **Keep at least one instance always warm.** Do not scale the app to zero.
   Cold starts rebuild the in-memory provider/tariff caches (tens of thousands
   of rows from Prognosis) and make the first searches slow.
3. **Ship the standalone image** (the provided Dockerfile already does this).
   It boots faster and is a fraction of the size of a full `node_modules`.
4. **Cache warming / persistence.** The treatment catalog is already persisted
   in the database (`ProcedureCatalogEntry`, refreshed daily). The provider and
   tariff lists are in-memory only and rebuild on restart. If cold-start search
   latency is a problem, the next step is a shared cache (Huawei **DCS** /
   Redis) or persisting those lists too. Not required to launch.
5. **Prognosis latency is the other half.** Enrollee search hits Prognosis live.
   If Prognosis is reachable with lower latency from a particular Huawei region,
   prefer that region. Outbound calls are already bounded (12s auth, 20s data)
   so a slow Prognosis degrades gracefully rather than hanging.

---

## 8. Security and go-live checklist

Clear these before opening to all staff (details in the security review):

- [ ] **Automated database backups on.** No PII tool ships without them.
- [ ] **Rotate any credentials** that were shared during development, and set
      `MFA_HASH_SECRET`.
- [ ] **`ENABLE_DEBUG_ROUTES` unset** in production (debug routes 404 by default).
- [ ] **Wire logs to LTS and set an error-rate alert** (AOM). The app surfaces
      failures to users but has no alerting of its own.
- [ ] **Every pilot user has a valid email in Prognosis.** No email means MFA
      cannot complete and they cannot sign in.
- [ ] **Verify one real login and one full case completion** against live
      Prognosis on the deployed build. The auth flow and the Prognosis push are
      the two things that can only be confirmed against the real upstream.
- [ ] Decide whether Contact Centre and Provider Team should see all reports and
      enrollee PII, or whether some of that is Admin-only.

---

## 9. Known Prognosis quirks the team should know

These are upstream behaviors, not app bugs. The app already works around them.

- **Prognosis returns HTTP 200 even on failure**, with the real status in the
  body. The app checks the body, not just the HTTP code.
- **Prognosis ignores `EndDate` on a tariff push.** A price only ends when a
  successor price starts. This is why the app schedules a successor price on the
  end date rather than relying on an end-date field.
- **Some tariff line codes carry leading whitespace** (e.g. a tab) that
  distinguishes a provider's real line from a same-looking code for a different
  procedure. The app preserves codes byte-for-byte and verifies every push
  actually landed on the provider's tariff before reporting success.
- **A provider can have very large tariff lists** (tens of thousands of rows),
  which is why the lists are cached in memory.

---

## 10. First-run bootstrap

1. Provision RDS, create the database, note the connection URLs.
2. Set the env vars (section 4).
3. Deploy the image (section 5); migrations run automatically and create the
   schema on an empty database.
4. Sign in with a username listed in `ADMIN_USERNAMES`; you land as Admin.
5. In Configuration, assign roles to colleagues as they sign in.

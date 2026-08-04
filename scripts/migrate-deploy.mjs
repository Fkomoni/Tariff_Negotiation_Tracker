#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy` with two pieces of tolerance the bare CLI lacks.
 *
 * 1. DIRECT_URL is optional. The schema declares `directUrl = env("DIRECT_URL")`
 *    so migrations can bypass a connection pooler, but Prisma treats a missing
 *    env var referenced in the schema as a hard validation failure (P1012) —
 *    which meant a deploy could fail outright just because the variable hadn't
 *    been added yet. If it's absent we fall back to DATABASE_URL and say so.
 *
 * 2. Pooler client-limit errors are retried. Migrations run while the previous
 *    version of the app is still serving and holding connections, so against a
 *    small pool (Supabase's session mode caps at 15) the migration can lose the
 *    race and fail with EMAXCONNSESSION even though nothing is actually wrong.
 *    Retrying a few times with backoff clears it; a genuine failure still exits
 *    non-zero and fails the deploy.
 */
import { spawn } from "node:child_process";

/**
 * Turns a Supabase *pooler* URL into the project's direct (non-pooled) URL.
 *
 * Supabase pooler URLs are deterministic:
 *   postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
 * and the matching direct endpoint is:
 *   postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
 *
 * Deriving it means migrations bypass the pooler without anyone having to set
 * DIRECT_URL by hand — which matters because the pooler's session mode caps at
 * 15 clients, and the running app holds most of them, so a migration through
 * the pooler can fail no matter how many times it retries.
 *
 * Returns null for anything that isn't a recognisable Supabase pooler URL.
 */
function deriveSupabaseDirectUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith(".pooler.supabase.com")) return null;

  // The pooler encodes the project ref in the username as "postgres.<ref>".
  const [role, ref] = decodeURIComponent(url.username).split(".");
  if (!role || !ref) return null;

  const direct = new URL(raw);
  direct.hostname = `db.${ref}.supabase.co`;
  direct.port = "5432";
  direct.username = encodeURIComponent(role);
  // Transaction-mode flags are meaningless (and rejected) off the pooler.
  direct.searchParams.delete("pgbouncer");
  direct.searchParams.delete("connection_limit");
  if (!direct.searchParams.has("sslmode")) direct.searchParams.set("sslmode", "require");
  return direct.toString();
}

const RETRYABLE = [
  "EMAXCONNSESSION",
  "max clients reached",
  "too many connections",
  "Timed out fetching a new connection",
];
const MAX_ATTEMPTS = 4;

/**
 * Candidate URLs to migrate through, best first. Each is tried in turn so a
 * derived direct endpoint that isn't reachable (Supabase direct connections are
 * IPv6-only without the IPv4 add-on) falls back to the pooler rather than
 * failing the deploy.
 */
const candidates = [];

if (process.env.DIRECT_URL?.trim()) {
  candidates.push({ label: "DIRECT_URL", url: process.env.DIRECT_URL.trim() });
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (databaseUrl) {
  const derived = candidates.length === 0 ? deriveSupabaseDirectUrl(databaseUrl) : null;
  if (derived) {
    candidates.push({ label: "derived Supabase direct connection", url: derived });
  }
  candidates.push({ label: "DATABASE_URL", url: databaseUrl });
}

if (candidates.length === 0) {
  console.error("[migrate] Neither DIRECT_URL nor DATABASE_URL is set — cannot run migrations.");
  process.exit(1);
}

function attempt(url) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      shell: false,
      // Overrides DATABASE_URL rather than setting DIRECT_URL, so the schema
      // needn't declare a directUrl at all — see prisma/schema.prisma.
      env: { ...process.env, DATABASE_URL: url },
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        output += chunk.toString();
        process.stdout.write(chunk);
      });
    }
    child.on("close", (code) => resolve({ code, output }));
  });
}

/** Errors that mean "this endpoint won't work" rather than "try again". */
const UNREACHABLE = ["P1001", "Can't reach database server", "ENOTFOUND", "ENETUNREACH", "EHOSTUNREACH"];

let lastCode = 1;

for (const [index, candidate] of candidates.entries()) {
  const isLast = index === candidates.length - 1;
  console.log(`[migrate] Using ${candidate.label}.`);

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const { code, output } = await attempt(candidate.url);
    if (code === 0) process.exit(0);
    lastCode = code ?? 1;

    if (UNREACHABLE.some((needle) => output.includes(needle)) && !isLast) {
      console.warn(`[migrate] ${candidate.label} is unreachable; trying the next connection.`);
      break;
    }

    const retryable = RETRYABLE.some((needle) => output.includes(needle));
    if (!retryable) break;
    if (i === MAX_ATTEMPTS) {
      if (!isLast) {
        console.warn(`[migrate] ${candidate.label} stayed at its client limit; trying the next connection.`);
        break;
      }
      console.error("[migrate] Every connection was at its client limit.");
      console.error("[migrate] The running app is holding the pool. Either set DIRECT_URL to the");
      console.error("[migrate] direct (non-pooled) URL, or add ?connection_limit=3 to DATABASE_URL.");
      process.exit(lastCode);
    }

    const waitMs = i * 5000;
    console.warn(`[migrate] Connection limit hit (attempt ${i}/${MAX_ATTEMPTS}); retrying in ${waitMs / 1000}s…`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

console.error("[migrate] Failed: no usable connection.");
process.exit(lastCode);

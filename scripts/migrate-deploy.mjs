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

const RETRYABLE = [
  "EMAXCONNSESSION",
  "max clients reached",
  "too many connections",
  "Timed out fetching a new connection",
];
const MAX_ATTEMPTS = 4;

if (!process.env.DIRECT_URL?.trim()) {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[migrate] Neither DIRECT_URL nor DATABASE_URL is set — cannot run migrations.");
    process.exit(1);
  }
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  console.warn(
    "[migrate] DIRECT_URL is not set; falling back to DATABASE_URL.\n" +
      "[migrate] If DATABASE_URL points at a connection pooler this may fail — migrations\n" +
      "[migrate] need a session. Set DIRECT_URL to the database's direct (non-pooled) URL."
  );
}

function attempt() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], { shell: false });
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

for (let i = 1; i <= MAX_ATTEMPTS; i++) {
  const { code, output } = await attempt();
  if (code === 0) process.exit(0);

  const retryable = RETRYABLE.some((needle) => output.includes(needle));
  if (!retryable || i === MAX_ATTEMPTS) {
    console.error(`[migrate] Failed${retryable ? ` after ${i} attempts` : ""}.`);
    process.exit(code ?? 1);
  }

  const waitMs = i * 5000;
  console.warn(`[migrate] Connection limit hit (attempt ${i}/${MAX_ATTEMPTS}); retrying in ${waitMs / 1000}s…`);
  await new Promise((r) => setTimeout(r, waitMs));
}

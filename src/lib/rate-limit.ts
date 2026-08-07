import { headers } from "next/headers";

/**
 * Best-effort caller IP from proxy headers - Render sits in front of this
 * app, so the real client IP arrives via X-Forwarded-For, not the socket.
 *
 * Takes the LAST entry, not the first: each hop in a proxy chain appends its
 * observed peer address to the right of the list, so the leftmost entry is
 * whatever the originating client sent - fully attacker-controlled - and
 * the rightmost is the address Render's own edge actually observed, which a
 * client can't forge. Taking the first entry would let an attacker rotate a
 * fake X-Forwarded-For on every request to reset their own rate-limit
 * bucket on demand. This assumes Render is a single reverse-proxy hop in
 * front of this app; if another proxy/CDN is ever added in front of Render,
 * re-check which entry is actually trustworthy.
 */
/**
 * Returns null when no real client IP can be determined, rather than a
 * placeholder like "unknown" - a placeholder would put every request that
 * hits this gap into the *same* rate-limit bucket, so unrelated users could
 * lock each other out of a shared bucket instead of each getting their own.
 * Callers should skip IP-based limiting entirely when this returns null.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return h.get("x-real-ip") ?? null;
}

/**
 * Durable fixed-window rate limiter backed by the RateLimit table. Unlike the
 * previous in-memory Map, this survives deploys/restarts (so the login
 * brute-force budget isn't wiped on every deploy) and is shared across
 * instances (so horizontal scaling doesn't multiply the effective limit).
 *
 * The counter is incremented with a single atomic INSERT ... ON CONFLICT so
 * concurrent requests can't lose an increment; the row is reused and reset
 * once its window (`expiresAt`) has passed.
 */
import { prisma } from "@/lib/prisma";

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the window resets, only meaningful when !allowed. */
  retryAfterMs: number;
}

/** Atomically increments the counter for `key` within a fresh/continuing
 * window and returns the new count. One statement, so it's safe under
 * concurrency (the ON CONFLICT branch takes a row lock). */
async function bump(key: string, windowMs: number): Promise<number> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"     = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimit"."expiresAt" END
    RETURNING "count"
  `;
  // Best-effort cleanup of long-expired buckets so distinct keys don't
  // accumulate forever; cheap and rare, never on the critical path's result.
  if (Math.random() < 0.01) {
    await prisma.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } }).catch(() => {});
  }
  return Number(rows[0]?.count ?? 1);
}

/** Consumes one unit against the window (increment-and-check). Use where every
 * call should count - OTP send/verify, enrollee search. */
export async function consumeRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const count = await bump(key, windowMs);
  return count > max ? { allowed: false, retryAfterMs: windowMs } : { allowed: true, retryAfterMs: 0 };
}

/** Read-only check without incrementing. Used at login entry so a *successful*
 * login never spends budget - only actual failures do (see recordRateLimitFailure). */
export async function peekRateLimit(key: string, max: number): Promise<RateLimitResult> {
  const now = new Date();
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row || row.expiresAt <= now) return { allowed: true, retryAfterMs: 0 };
  if (row.count >= max) return { allowed: false, retryAfterMs: row.expiresAt.getTime() - now.getTime() };
  return { allowed: true, retryAfterMs: 0 };
}

/** Records one failed attempt against the window (increment only). Paired with
 * peekRateLimit so only failures count toward a lockout. */
export async function recordRateLimitFailure(key: string, windowMs: number): Promise<void> {
  await bump(key, windowMs);
}

/** Clears a key's window early - used to reset the OTP-verify counter once a code is consumed. */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

import { headers } from "next/headers";

/** Best-effort caller IP from proxy headers — Render sits in front of this
 * app, so the real client IP arrives via X-Forwarded-For, not the socket. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * In-memory fixed-window rate limiter. This is a single-process, best-effort
 * throttle (it doesn't survive a restart or coordinate across multiple
 * instances) — matching the scale of the rest of this app's in-memory
 * caching (see prognosis.ts's provider/tariff caches) rather than pulling in
 * an external store for a low-traffic internal staff portal. It still turns
 * "unlimited attempts" into "bounded attempts," which is the actual gap.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 20_000;

function sweepExpired(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the window resets, only meaningful when !allowed. */
  retryAfterMs: number;
}

/** Allows up to `max` calls per `windowMs` for a given key, fixed-window. */
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= max) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Clears a key's window early — used to reset the OTP-verify counter once a code is consumed. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { MfaCodePurpose } from "@prisma/client";

export const TRUST_COOKIE_NAME = "tnt_trusted_device";

const OTP_TTL_MS = 10 * 60 * 1000;
const TRUST_TTL_MS = 45 * 24 * 60 * 60 * 1000;

const OTP_SEND_MAX = 5;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_VERIFY_MAX = 6;
const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;

/** Thrown by issueOtp() when a user/purpose has requested too many codes
 * recently — callers should surface a "try again later" message rather than
 * silently emailing another code (or erroring with a raw 500). */
export class OtpRateLimitedError extends Error {
  constructor(public retryAfterMs: number) {
    super("Too many verification codes requested — try again later.");
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Hashes an OTP for storage and comparison. A 6-digit code has only 10^6
 * possible values, so a plain unsalted hash is trivially reversible from a DB
 * read (precompute all 10^6 hashes in under a second). Binding it to a server
 * secret via HMAC makes the stored hash useless to anyone without that secret.
 *
 * Falls back to plain SHA-256 when MFA_HASH_SECRET is unset, so login never
 * breaks before the secret is configured — set it (openssl rand -hex 32) to
 * enable the stronger form. In-flight codes issued under the old form simply
 * fail to verify once the secret is added (single-use, 10-min TTL — the user
 * just requests a new code), so enabling it is safe at any time.
 *
 * The high-entropy session and trusted-device tokens deliberately keep plain
 * sha256: for a 256-bit random token there is nothing to brute-force, so HMAC
 * would add key-management burden for no gain.
 */
function hashOtp(code: string): string {
  const secret = process.env.MFA_HASH_SECRET;
  return secret && secret.length > 0
    ? crypto.createHmac("sha256", secret).update(code).digest("hex")
    : sha256(code);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Issues a fresh single-use OTP for the given purpose, storing only its hash.
 * Throws OtpRateLimitedError if too many codes have been requested recently
 * — otherwise an attacker (or a mistake) could email-bomb a user's inbox. */
export async function issueOtp(userId: string, purpose: MfaCodePurpose): Promise<string> {
  const sendLimit = await consumeRateLimit(`otp-send:${userId}:${purpose}`, OTP_SEND_MAX, OTP_SEND_WINDOW_MS);
  if (!sendLimit.allowed) throw new OtpRateLimitedError(sendLimit.retryAfterMs);

  const code = generateOtp();
  await prisma.mfaCode.create({
    data: {
      userId,
      purpose,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return code;
}

/** Verifies against the most recent unconsumed, unexpired code for this purpose, consuming it on success.
 * Rate-limited per user/purpose — a 6-digit code is only safe against
 * brute force if attempts are bounded, since nothing else limits how many
 * guesses a request can make within the code's 10-minute validity. */
export async function verifyOtp(userId: string, purpose: MfaCodePurpose, code: string): Promise<boolean> {
  const verifyKey = `otp-verify:${userId}:${purpose}`;
  const verifyLimit = await consumeRateLimit(verifyKey, OTP_VERIFY_MAX, OTP_VERIFY_WINDOW_MS);
  if (!verifyLimit.allowed) {
    // Burn the outstanding code too, not just the attempt budget — otherwise
    // the same code stays guessable again the instant the window rolls over.
    await prisma.mfaCode.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return false;
  }

  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;

  const candidate = await prisma.mfaCode.findFirst({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) return false;
  if (!timingSafeEqualHex(candidate.codeHash, hashOtp(trimmed))) return false;

  await prisma.mfaCode.update({ where: { id: candidate.id }, data: { consumedAt: new Date() } });
  await resetRateLimit(verifyKey);
  return true;
}

/** Checks the trusted-device cookie (if any) against TrustedDevice rows for this user. */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const token = (await cookies()).get(TRUST_COOKIE_NAME)?.value;
  if (!token) return false;

  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.userId !== userId || device.expiresAt <= new Date()) return false;

  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return true;
}

/** Marks this browser as trusted for 45 days: stores a hashed token server-side, sets the raw token in an httpOnly cookie. */
export async function trustThisDevice(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TRUST_TTL_MS);

  await prisma.trustedDevice.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });

  (await cookies()).set(TRUST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

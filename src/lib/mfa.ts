import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { MfaCodePurpose } from "@prisma/client";

export const TRUST_COOKIE_NAME = "tnt_trusted_device";

const OTP_TTL_MS = 10 * 60 * 1000;
const TRUST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
  const sendLimit = checkRateLimit(`otp-send:${userId}:${purpose}`, OTP_SEND_MAX, OTP_SEND_WINDOW_MS);
  if (!sendLimit.allowed) throw new OtpRateLimitedError(sendLimit.retryAfterMs);

  const code = generateOtp();
  await prisma.mfaCode.create({
    data: {
      userId,
      purpose,
      codeHash: sha256(code),
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
  const verifyLimit = checkRateLimit(verifyKey, OTP_VERIFY_MAX, OTP_VERIFY_WINDOW_MS);
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
  if (!timingSafeEqualHex(candidate.codeHash, sha256(trimmed))) return false;

  await prisma.mfaCode.update({ where: { id: candidate.id }, data: { consumedAt: new Date() } });
  resetRateLimit(verifyKey);
  return true;
}

/** Checks the trusted-device cookie (if any) against TrustedDevice rows for this user. */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const token = cookies().get(TRUST_COOKIE_NAME)?.value;
  if (!token) return false;

  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.userId !== userId || device.expiresAt <= new Date()) return false;

  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return true;
}

/** Marks this browser as trusted for 90 days: stores a hashed token server-side, sets the raw token in an httpOnly cookie. */
export async function trustThisDevice(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TRUST_TTL_MS);

  await prisma.trustedDevice.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });

  cookies().set(TRUST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

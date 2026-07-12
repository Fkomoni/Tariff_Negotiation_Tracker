import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { MfaCodePurpose } from "@prisma/client";

export const TRUST_COOKIE_NAME = "tnt_trusted_device";

const OTP_TTL_MS = 10 * 60 * 1000;
const TRUST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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

/** Issues a fresh single-use OTP for the given purpose, storing only its hash. */
export async function issueOtp(userId: string, purpose: MfaCodePurpose): Promise<string> {
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

/** Verifies against the most recent unconsumed, unexpired code for this purpose, consuming it on success. */
export async function verifyOtp(userId: string, purpose: MfaCodePurpose, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;

  const candidate = await prisma.mfaCode.findFirst({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) return false;
  if (!timingSafeEqualHex(candidate.codeHash, sha256(trimmed))) return false;

  await prisma.mfaCode.update({ where: { id: candidate.id }, data: { consumedAt: new Date() } });
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

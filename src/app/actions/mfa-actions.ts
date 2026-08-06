"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, resolveStaffUser, checkLoginRateLimit, recordLoginFailure, completeLogin, type CompleteLoginResult } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrognosisAuthError, PrognosisUnavailableError, sendEmailAlert } from "@/lib/prognosis";
import { issueOtp, isDeviceTrusted, OtpRateLimitedError } from "@/lib/mfa";
import { buildMfaCodeEmailHtml } from "@/lib/email-template";
import { redirectWithToast } from "@/lib/toast";

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://tariff-negotiation-tracker.onrender.com";

export type CredentialsCheckResult =
  | { status: "invalid_credentials" }
  | { status: "upstream_unavailable" }
  | { status: "no_mfa_needed" }
  | { status: "no_email_on_file" }
  | { status: "otp_sent" }
  | { status: "rate_limited" };

/**
 * Step 1 of login: verifies the password against Prognosis (never send an
 * OTP, or let the client reach the code-entry step, without that) and
 * decides whether an MFA challenge is actually needed for this device.
 *
 * MFA applies to every account — the only way this returns "no_mfa_needed"
 * is a previously-trusted device.
 *
 * Shares its rate-limit budget with authorize() in auth.ts (same username/IP
 * keys) — this function also drives a full Prognosis credential check, so it
 * must count against the same attempt limit, not double it.
 */
export async function checkCredentialsAndMaybeSendOtp(username: string, password: string): Promise<CredentialsCheckResult> {
  if (!(await checkLoginRateLimit(username)).allowed) {
    return { status: "rate_limited" };
  }

  let user;
  try {
    user = await resolveStaffUser(username, password);
  } catch (err) {
    if (err instanceof PrognosisUnavailableError) return { status: "upstream_unavailable" };
    if (err instanceof PrognosisAuthError) {
      // Only failed passwords count toward the lockout (shared budget with
      // completeLogin's own failure record via the same username/IP keys).
      await recordLoginFailure(username);
      return { status: "invalid_credentials" };
    }
    throw err;
  }

  if (await isDeviceTrusted(user.id)) return { status: "no_mfa_needed" };

  if (!user.email) return { status: "no_email_on_file" };

  try {
    const code = await issueOtp(user.id, "LOGIN");
    await sendEmailAlert({
      emailAddress: user.email,
      subject: "Your Tariff Negotiation Tracker sign-in code",
      messageBody: buildMfaCodeEmailHtml({ baseUrl: BASE_URL, code, purpose: "sign in to", requestedAt: new Date() }),
      reference: "MFA-LOGIN",
    });
  } catch (err) {
    if (err instanceof OtpRateLimitedError) return { status: "rate_limited" };
    throw err;
  }

  return { status: "otp_sent" };
}

/**
 * Step 2 of login: called once credentials are verified (and an OTP sent,
 * if needed) — re-verifies everything and, on success, mints the session.
 * A thin Server Action wrapper around completeLogin() in auth.ts, which is
 * a plain module the (app) layout and pages also import for unrelated
 * reasons; keeping the "use server" boundary here instead of on that whole
 * file keeps this the one and only client-callable entry point for it.
 */
export async function completeLoginAction(input: {
  username: string;
  password: string;
  mfaCode?: string;
  trustDevice?: boolean;
}): Promise<CompleteLoginResult> {
  return completeLogin(input);
}

async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function revokeTrustedDevice(formData: FormData) {
  const session = await requireSession();
  const deviceId = String(formData.get("deviceId") ?? "");

  const device = await prisma.trustedDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== session.user.id) {
    redirectWithToast("/account/security", { type: "error", message: "That device wasn't found." });
  }

  await prisma.trustedDevice.delete({ where: { id: deviceId } });
  revalidatePath("/account/security");
  redirectWithToast("/account/security", { type: "success", message: "Device access revoked." });
}

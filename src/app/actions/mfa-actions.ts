"use server";

import { revalidatePath } from "next/cache";
import { auth, resolveStaffUser, checkLoginRateLimit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrognosisAuthError, PrognosisUnavailableError, sendEmailAlert } from "@/lib/prognosis";
import { issueOtp, isDeviceTrusted, OtpRateLimitedError } from "@/lib/mfa";

function otpEmailHtml(code: string, purpose: "sign in to"): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f2f3;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f3;padding:28px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border-radius:14px;border:1px solid #ece7ea;">
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9a94a1;">Leadway Health &middot; Provider Tariff Negotiation Tracker</p>
          <h1 style="margin:0 0 12px 0;font-size:20px;color:#171316;">Your verification code</h1>
          <p style="margin:0 0 20px 0;font-size:13.5px;line-height:1.6;color:#6b6470;">Use this code to ${purpose} your account. It expires in 10 minutes.</p>
          <p style="margin:0 0 20px 0;font-size:32px;font-weight:800;letter-spacing:.12em;color:#F2661B;">${code}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#9a94a1;">If you didn't request this, you can ignore this email — no changes were made to your account.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type CredentialsCheckResult =
  | { status: "invalid_credentials" }
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
    if (err instanceof PrognosisAuthError || err instanceof PrognosisUnavailableError) {
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
      messageBody: otpEmailHtml(code, "sign in to"),
      reference: "MFA-LOGIN",
    });
  } catch (err) {
    if (err instanceof OtpRateLimitedError) return { status: "rate_limited" };
    throw err;
  }

  return { status: "otp_sent" };
}

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

export async function revokeTrustedDevice(formData: FormData) {
  const session = await requireSession();
  const deviceId = String(formData.get("deviceId") ?? "");

  const device = await prisma.trustedDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== session.user.id) throw new Error("Device not found");

  await prisma.trustedDevice.delete({ where: { id: deviceId } });
  revalidatePath("/account/security");
}

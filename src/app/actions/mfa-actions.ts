"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, resolveStaffUser, checkLoginRateLimit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prognosisStaffLogin, PrognosisAuthError, PrognosisUnavailableError, sendEmailAlert } from "@/lib/prognosis";
import { issueOtp, verifyOtp, isDeviceTrusted, OtpRateLimitedError } from "@/lib/mfa";
import { logAudit } from "@/lib/audit";

function otpEmailHtml(code: string, purpose: "sign in to" | "enable multi-factor authentication on"): string {
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
 * decides whether an MFA challenge is actually needed for this user/device.
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

  if (!user.mfaEnabled) return { status: "no_mfa_needed" };
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

/** Sends the confirmation code shown on the Account Security page before MFA is switched on. */
export async function requestEnableMfaCode() {
  const session = await requireSession();

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new Error("User not found");
  if (user.mfaEnabled) redirect("/account/security");
  if (!user.email) {
    redirect(`/account/security?error=${encodeURIComponent("No email is on file for your account — contact the IT Help Desk before enabling MFA.")}`);
  }

  try {
    const code = await issueOtp(user.id, "ENABLE");
    await sendEmailAlert({
      emailAddress: user.email,
      subject: "Confirm enabling MFA on your account",
      messageBody: otpEmailHtml(code, "enable multi-factor authentication on"),
      reference: "MFA-ENABLE",
    });
  } catch (err) {
    if (err instanceof OtpRateLimitedError) {
      redirect(`/account/security?error=${encodeURIComponent("Too many codes requested — wait a few minutes and try again.")}`);
    }
    throw err;
  }

  revalidatePath("/account/security");
  redirect("/account/security?codeSent=1");
}

export async function confirmEnableMfa(formData: FormData) {
  const session = await requireSession();
  const code = String(formData.get("code") ?? "").trim();

  const ok = await verifyOtp(session.user.id, "ENABLE", code);
  if (!ok) {
    redirect(`/account/security?error=${encodeURIComponent("That code is invalid or has expired. Request a new one and try again.")}`);
  }

  await prisma.user.update({ where: { id: session.user.id }, data: { mfaEnabled: true } });
  await logAudit("MFA_ENABLED", `${session.user.name ?? session.user.prognosisUsername} enabled MFA on their account`, session.user.id);

  revalidatePath("/account/security");
  redirect("/account/security?enabled=1");
}

export async function disableMfa(formData: FormData) {
  const session = await requireSession();
  const password = String(formData.get("password") ?? "");
  if (!password) {
    redirect(`/account/security?error=${encodeURIComponent("Enter your password to disable MFA.")}`);
  }

  try {
    await prognosisStaffLogin(session.user.prognosisUsername, password);
  } catch {
    redirect(`/account/security?error=${encodeURIComponent("Incorrect password.")}`);
  }

  // Dropping every trusted device too — a stale "trusted" browser from
  // before MFA was disabled shouldn't silently keep skipping the challenge
  // if MFA gets re-enabled later.
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.user.id }, data: { mfaEnabled: false } }),
    prisma.trustedDevice.deleteMany({ where: { userId: session.user.id } }),
  ]);

  await logAudit("MFA_DISABLED", `${session.user.name ?? session.user.prognosisUsername} disabled MFA on their account`, session.user.id);

  revalidatePath("/account/security");
  redirect("/account/security?disabled=1");
}

export async function revokeTrustedDevice(formData: FormData) {
  const session = await requireSession();
  const deviceId = String(formData.get("deviceId") ?? "");

  const device = await prisma.trustedDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== session.user.id) throw new Error("Device not found");

  await prisma.trustedDevice.delete({ where: { id: deviceId } });
  revalidatePath("/account/security");
}

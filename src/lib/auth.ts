import { prisma } from "@/lib/prisma";
import { prognosisStaffLogin, PrognosisAuthError, PrognosisUnavailableError } from "@/lib/prognosis";
import { logAudit } from "@/lib/audit";
import { isDeviceTrusted, trustThisDevice, verifyOtp } from "@/lib/mfa";
import { peekRateLimit, recordRateLimitFailure, getClientIp } from "@/lib/rate-limit";
import { createSession, getSession } from "@/lib/session";
import { Prisma, type User as PrismaUser } from "@prisma/client";

const LOGIN_MAX_PER_USERNAME = 8;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Shared by completeLogin() below and checkCredentialsAndMaybeSendOtp()
 * (mfa-actions.ts) — both independently call Prognosis to verify a password,
 * so both must count against the same budget or an attacker gets double the
 * attempts by alternating between the two entry points.
 */
export async function checkLoginRateLimit(username: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  // Read-only: a *successful* login must not spend budget, or one normal
  // sign-in (which verifies the password at two entry points) plus a mistype
  // or a "resend code" would self-lock a legitimate user. Only actual failures
  // count, recorded by recordLoginFailure below on a rejected password.
  const byUser = await peekRateLimit(`login:user:${username.toLowerCase()}`, LOGIN_MAX_PER_USERNAME);
  if (!byUser.allowed) return byUser;

  // Skipped entirely when the client IP can't be determined, rather than
  // falling back to a shared placeholder bucket — that previously locked
  // out every user hitting the same fallback at once instead of just the
  // one actually making repeated attempts. The per-username check above is
  // what actually protects a given account either way.
  const ip = await getClientIp();
  if (ip) {
    const byIp = await peekRateLimit(`login:ip:${ip}`, LOGIN_MAX_PER_IP);
    if (!byIp.allowed) return byIp;
  }
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Records one failed credential verification against both the per-username and
 * per-IP budgets. Called from every place that rejects a password, so the two
 * login entry points (this file's completeLogin and mfa-actions'
 * checkCredentialsAndMaybeSendOtp) share one failure budget — an attacker
 * can't double their guesses by alternating endpoints.
 */
export async function recordLoginFailure(username: string): Promise<void> {
  await recordRateLimitFailure(`login:user:${username.toLowerCase()}`, LOGIN_WINDOW_MS);
  const ip = await getClientIp();
  if (ip) await recordRateLimitFailure(`login:ip:${ip}`, LOGIN_WINDOW_MS);
}

function getAdminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies a username/password against Prognosis and upserts the local User
 * row. Shared by completeLogin() below (the final step of login) and by
 * checkCredentialsAndMaybeSendOtp() in mfa-actions.ts (the pre-check that
 * decides whether an OTP challenge is needed) — both must independently
 * verify the password before doing anything else, so an attacker can't
 * trigger an OTP email (or worse, reach the code-entry step at all) for an
 * account whose password they don't have.
 *
 * Throws PrognosisAuthError / PrognosisUnavailableError on failure — callers
 * are expected to catch those.
 */
export async function resolveStaffUser(username: string, password: string): Promise<PrismaUser> {
  const staff = await prognosisStaffLogin(username, password);

  const isSeededAdmin = getAdminUsernames().includes(username.toLowerCase());

  // Match case-insensitively so "K-ezeudu@leadway.com" and
  // "k-ezeudu@leadway.com" resolve to the same account — including one
  // an Admin pre-provisioned with a role before this person ever signed
  // in. New accounts are always stored lowercased going forward.
  const existing = await prisma.user.findFirst({
    where: { prognosisUsername: { equals: username, mode: "insensitive" } },
  });

  if (existing) {
    // lastLoginAt is intentionally NOT written here — this runs at the
    // password step (pre-MFA), and lastLoginAt should reflect an actual
    // authenticated sign-in, so completeLogin sets it after MFA + session.
    const promote = isSeededAdmin && existing.role !== "ADMIN";
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: promote ? "ADMIN" : existing.role,
        displayName: existing.displayName ?? staff.displayName,
        email: existing.email ?? staff.email,
      },
    });
    // Auto-promotion previously happened silently; record it so an ADMIN
    // appearing is traceable in the audit log like any other role change.
    if (promote) {
      await logAudit(
        "ROLE_CHANGE",
        `${updated.displayName ?? updated.prognosisUsername} auto-promoted to Admin (listed in ADMIN_USERNAMES)`,
        updated.id
      );
    }
    return updated;
  }

  try {
    return await prisma.user.create({
      data: {
        prognosisUsername: username.toLowerCase(),
        displayName: staff.displayName,
        email: staff.email,
        role: isSeededAdmin ? "ADMIN" : "PENDING",
      },
    });
  } catch (err) {
    // A concurrent first-time login/provision for the same (case-variant)
    // username can race between the findFirst above and this create — the
    // database's case-insensitive unique index (see prisma/schema.prisma)
    // rejects the second insert instead of allowing a duplicate account.
    // Re-fetch and use whichever row won the race rather than surfacing a
    // 500 to a real user for something that isn't actually an error case.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.user.findFirst({
        where: { prognosisUsername: { equals: username, mode: "insensitive" } },
      });
      if (winner) {
        return prisma.user.update({
          where: { id: winner.id },
          data: { lastLoginAt: new Date() },
        });
      }
    }
    throw err;
  }
}

export type CompleteLoginResult =
  | { status: "success" }
  | { status: "invalid_credentials" }
  | { status: "upstream_unavailable" }
  | { status: "mfa_required" }
  | { status: "mfa_invalid" }
  | { status: "rate_limited" };

/**
 * Final step of login: re-verifies the password against Prognosis (the same
 * check checkCredentialsAndMaybeSendOtp already ran once — this is the pass
 * that actually gates minting a session, so it can't just trust the earlier
 * one), then the MFA challenge if this device isn't already trusted, then
 * creates the session. Returns a plain result instead of throwing — the
 * client-facing Server Action wrapper lives in mfa-actions.ts.
 */
export async function completeLogin(input: {
  username: string;
  password: string;
  mfaCode?: string;
  trustDevice?: boolean;
}): Promise<CompleteLoginResult> {
  const username = input.username.trim();
  const password = input.password;
  if (!username || !password) return { status: "invalid_credentials" };

  if (!(await checkLoginRateLimit(username)).allowed) {
    console.error(`[auth] rate_limited for username "${username}"`);
    return { status: "rate_limited" };
  }

  let user: PrismaUser;
  try {
    user = await resolveStaffUser(username, password);
  } catch (err) {
    console.error(`[auth] Prognosis staff login failed for username:`, username, err);
    // Kept distinct: Prognosis being unreachable is not the same as Prognosis
    // rejecting the password. Collapsing them told staff "invalid username or
    // password" during an upstream outage, so they retried a correct password
    // until the rate limiter locked them out.
    if (err instanceof PrognosisUnavailableError) return { status: "upstream_unavailable" };
    if (err instanceof PrognosisAuthError) {
      // Count the failed password against the brute-force budget (see
      // recordLoginFailure). Upstream-unavailable is deliberately NOT counted
      // — that's not a wrong password and shouldn't lock anyone out.
      await recordLoginFailure(username);
      return { status: "invalid_credentials" };
    }
    throw err;
  }

  // MFA is mandatory for every account — the only way to skip the
  // challenge is a previously-trusted device (still requires having
  // completed MFA once on that device).
  const trusted = await isDeviceTrusted(user.id);
  if (!trusted) {
    const mfaCode = input.mfaCode?.trim() ?? "";
    if (!mfaCode) {
      console.error(`[auth] mfa_required for username "${username}" (no code submitted yet)`);
      return { status: "mfa_required" };
    }
    const ok = await verifyOtp(user.id, "LOGIN", mfaCode);
    if (!ok) {
      // Doesn't log the submitted code itself — only that this attempt
      // didn't match, so this line can't be used to narrow down a live
      // code by trial and error via log access.
      console.error(`[auth] mfa_invalid for username "${username}" — code didn't match, was already used, or expired`);
      return { status: "mfa_invalid" };
    }
    if (input.trustDevice) await trustThisDevice(user.id);
  }

  await logAudit("LOGIN", `${user.displayName ?? user.prognosisUsername} signed in`, user.id);
  await createSession(user.id);
  // Set lastLoginAt only now — after MFA and a real session — so it reflects an
  // authenticated sign-in, not merely a verified password (resolveStaffUser,
  // which also runs at the pre-MFA credential check, no longer writes it).
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { status: "success" };
}

/** Re-exported under its previous name so the ~17 files that already call
 * `await auth()` for the current session need no changes. */
export const auth = getSession;

import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { prognosisStaffLogin, PrognosisAuthError, PrognosisUnavailableError } from "@/lib/prognosis";
import { logAudit } from "@/lib/audit";
import { isDeviceTrusted, trustThisDevice, verifyOtp } from "@/lib/mfa";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { Role, User as PrismaUser } from "@prisma/client";

const LOGIN_MAX_PER_USERNAME = 8;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Shared by authorize() and checkCredentialsAndMaybeSendOtp() (mfa-actions.ts)
 * — both independently call Prognosis to verify a password, so both must
 * count against the same budget or an attacker gets double the attempts by
 * alternating between the two entry points.
 */
export async function checkLoginRateLimit(username: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const byUser = checkRateLimit(`login:user:${username.toLowerCase()}`, LOGIN_MAX_PER_USERNAME, LOGIN_WINDOW_MS);
  const byIp = checkRateLimit(`login:ip:${await getClientIp()}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  if (!byUser.allowed) return byUser;
  if (!byIp.allowed) return byIp;
  return { allowed: true, retryAfterMs: 0 };
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      prognosisUsername: string;
    } & DefaultSession["user"];
  }
  interface User {
    role?: Role;
    prognosisUsername?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    prognosisUsername?: string;
  }
}

function getAdminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies a username/password against Prognosis and upserts the local User
 * row. Shared by authorize() below (the final step of login) and by
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

  return existing
    ? prisma.user.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: new Date(),
          role: isSeededAdmin && existing.role !== "ADMIN" ? "ADMIN" : existing.role,
          displayName: existing.displayName ?? staff.displayName,
          email: existing.email ?? staff.email,
        },
      })
    : prisma.user.create({
        data: {
          prognosisUsername: username.toLowerCase(),
          displayName: staff.displayName,
          email: staff.email,
          role: isSeededAdmin ? "ADMIN" : "PENDING",
          lastLoginAt: new Date(),
        },
      });
}

/** Thrown from authorize() when the user has MFA enabled, the device isn't
 * trusted, and no code was submitted yet — tells the client to show the OTP
 * entry step instead of a generic "invalid credentials" error. */
class MfaRequiredSignin extends CredentialsSignin {
  code = "mfa_required";
}

/** Thrown when a submitted MFA code is missing, wrong, expired, or already used. */
class MfaInvalidCodeSignin extends CredentialsSignin {
  code = "mfa_invalid";
}

/** Thrown when too many login attempts have come from this username or IP recently. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    // 15-minute idle timeout for a staff portal holding enrollee PII and
    // negotiated pricing. This is a rolling window, not a fixed session
    // length: updateAge re-issues the JWT (sliding maxAge forward) on every
    // request more than 5 minutes since the last refresh, so continuous
    // activity never logs someone out — only >15 minutes of zero requests
    // does.
    maxAge: 15 * 60,
    updateAge: 5 * 60,
  },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username or Email", type: "text" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA Code", type: "text" },
        trustDevice: { label: "Trust Device", type: "text" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;

        const mfaCode = credentials?.mfaCode ? String(credentials.mfaCode).trim() : "";
        const trustDevice = credentials?.trustDevice === "true";

        if (!(await checkLoginRateLimit(username)).allowed) {
          console.error(`[auth] rate_limited for username "${username}"`);
          throw new RateLimitedSignin();
        }

        let user: PrismaUser;
        try {
          user = await resolveStaffUser(username, password);
        } catch (err) {
          console.error(`[auth] Prognosis staff login failed for username "${username}":`, err);
          if (err instanceof PrognosisAuthError || err instanceof PrognosisUnavailableError) return null;
          throw err;
        }

        // MFA is mandatory for every account — the only way to skip the
        // challenge is a previously-trusted device (still requires having
        // completed MFA once on that device).
        const trusted = await isDeviceTrusted(user.id);
        if (!trusted) {
          if (!mfaCode) {
            console.error(`[auth] mfa_required for username "${username}" (no code submitted yet)`);
            throw new MfaRequiredSignin();
          }
          const ok = await verifyOtp(user.id, "LOGIN", mfaCode);
          if (!ok) {
            // Doesn't log the submitted code itself — only that this attempt
            // didn't match, so this line can't be used to narrow down a live
            // code by trial and error via log access.
            console.error(`[auth] mfa_invalid for username "${username}" — code didn't match, was already used, or expired`);
            throw new MfaInvalidCodeSignin();
          }
          if (trustDevice) await trustThisDevice(user.id);
        }

        await logAudit("LOGIN", `${user.displayName ?? user.prognosisUsername} signed in`, user.id);

        return {
          id: user.id,
          name: user.displayName ?? user.prognosisUsername,
          role: user.role,
          prognosisUsername: user.prognosisUsername,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.prognosisUsername = user.prognosisUsername;
        return token;
      }

      // Runs on every session read after initial sign-in (confirmed against
      // Auth.js's own session-reading code — this callback receives the
      // *incoming* cookie's original iat, not a refreshed one, and
      // returning null here makes Auth.js clear the session cookie on this
      // exact request). Skipped in the Edge proxy, where Prisma can't run —
      // that's fine, since proxy.ts is coarse UX routing, not the
      // authorization boundary; every real page/Server Action/API route
      // also calls auth() in the Node.js runtime and will catch a revoked
      // session there before any data is touched.
      if (process.env.NEXT_RUNTIME !== "edge" && token.id && typeof token.iat === "number") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { sessionInvalidatedAt: true },
        });
        if (dbUser?.sessionInvalidatedAt && dbUser.sessionInvalidatedAt.getTime() > token.iat * 1000) {
          return null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Kept edge-safe on purpose: this callback also runs inside middleware
      // (Edge runtime), where Prisma cannot execute. Role changes made in
      // Configuration take effect the next time the affected user signs in.
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      if (token.prognosisUsername) session.user.prognosisUsername = token.prognosisUsername;
      return session;
    },
  },
});

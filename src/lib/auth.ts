import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { prognosisStaffLogin, PrognosisAuthError, PrognosisUnavailableError } from "@/lib/prognosis";
import { logAudit } from "@/lib/audit";
import { isDeviceTrusted, trustThisDevice, verifyOtp } from "@/lib/mfa";
import type { Role, User as PrismaUser } from "@prisma/client";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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

        let user: PrismaUser;
        try {
          user = await resolveStaffUser(username, password);
        } catch (err) {
          console.error(`[auth] Prognosis staff login failed for username "${username}":`, err);
          if (err instanceof PrognosisAuthError || err instanceof PrognosisUnavailableError) return null;
          throw err;
        }

        if (user.mfaEnabled) {
          const trusted = await isDeviceTrusted(user.id);
          if (!trusted) {
            if (!mfaCode) throw new MfaRequiredSignin();
            const ok = await verifyOtp(user.id, "LOGIN", mfaCode);
            if (!ok) throw new MfaInvalidCodeSignin();
            if (trustDevice) await trustThisDevice(user.id);
          }
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

import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

export { SESSION_COOKIE_NAME };

/** Rolling idle timeout, same policy as the previous JWT session's maxAge. */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
/** Throttles how often an activity refresh is written to the database —
 * same purpose as Auth.js's own database-session updateAge throttle. */
const UPDATE_THROTTLE_MS = 5 * 60 * 1000;
/** Upper bound on how long the browser holds onto the cookie at all. Not
 * the security boundary — that's IDLE_TIMEOUT_MS, enforced server-side on
 * every read below — just a hygiene cap for a cookie that otherwise never
 * expires on its own. */
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  prognosisUsername: string;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** First 12 hex chars of a token's hash — enough to correlate log lines
 * across create/read/destroy for the same session, without logging
 * anything that could itself be replayed as a credential. */
function logId(hash: string): string {
  return hash.slice(0, 12);
}

/**
 * Creates a session row and sets the cookie exactly once. The raw token in
 * the cookie never changes again for the life of this session — getSession()
 * below only ever extends expiresAt in the database on activity, and never
 * rewrites the cookie itself. A JWT session cookie can't offer this: its
 * value is a re-encrypted payload, and authenticated encryption requires a
 * fresh random IV on every re-encryption, so the string changes on every
 * refresh even when nothing about the session actually changed. An opaque
 * lookup token has no such constraint.
 */
export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(token);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS),
    },
  });
  console.error(`[session] created ${logId(tokenHash)} for user ${userId}`);

  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

/**
 * Reads and validates the session cookie against the database, sliding the
 * idle-timeout window forward on real activity so continuous use never logs
 * someone out — only actually crossing IDLE_TIMEOUT_MS with zero requests
 * does. The DB write that extends expiresAt is throttled to at most once
 * per UPDATE_THROTTLE_MS; the cookie itself is never touched here.
 */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const id = logId(tokenHash);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) {
    console.error(`[session] read ${id}: no matching row -> rejected`);
    return null;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    console.error(`[session] read ${id}: expired at ${session.expiresAt.toISOString()} -> rejected`);
    return null;
  }

  const now = Date.now();
  const dueToBeExtended = session.expiresAt.getTime() - IDLE_TIMEOUT_MS + UPDATE_THROTTLE_MS <= now;
  if (dueToBeExtended) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(now + IDLE_TIMEOUT_MS) },
    });
    console.error(`[session] read ${id}: valid for user ${session.userId}, extended expiresAt`);
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.displayName ?? session.user.prognosisUsername,
      role: session.user.role,
      prognosisUsername: session.user.prognosisUsername,
    },
  };
}

/** Deletes the session row and clears the cookie. A copy of the token
 * captured before logout stops working immediately — there's no row left
 * for it to match — rather than remaining valid until its own expiry. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = sha256(token);
    const { count } = await prisma.session.deleteMany({ where: { tokenHash } });
    console.error(`[session] destroy ${logId(tokenHash)}: deleted ${count} row(s)`);
  } else {
    console.error("[session] destroy: no cookie present on this request");
  }
  jar.delete(SESSION_COOKIE_NAME);
}

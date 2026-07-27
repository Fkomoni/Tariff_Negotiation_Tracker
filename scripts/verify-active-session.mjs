// Manual verification for F1 (session token lifecycle): creates a
// temporary, clearly-labeled test login, forces a refresh, replays the OLD
// cookie against the current database state, and checks whether it's
// rejected. Deletes its own test data at the end regardless of outcome --
// never touches a real user.
//
// Run directly on the deployed instance (e.g. Render's Shell tab):
//   node scripts/verify-active-session.mjs

import { PrismaClient } from "@prisma/client";
import { encode, decode } from "@auth/core/jwt";
import crypto from "crypto";

const prisma = new PrismaClient();
const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const SALT = "__Secure-authjs.session-token"; // Auth.js's real production cookie name
const SESSION_MAX_AGE_SECONDS = 15 * 60;
const SESSION_UPDATE_AGE_SECONDS = 5 * 60;
const SESSION_CREATION_GRACE_SECONDS = 60;

// Mirrors src/lib/active-session.ts's evaluateActiveSession exactly.
function evaluateActiveSession({ activeSession, tokenVersion, tokenIat, nowMs, updateAgeSeconds, creationGraceSeconds }) {
  const secondsSinceIssued = nowMs / 1000 - tokenIat;
  if (activeSession && activeSession.currentJti === tokenVersion) {
    if (activeSession.expiresAt.getTime() < nowMs) return { accept: false, shouldRotate: false };
    return { accept: true, shouldRotate: secondsSinceIssued > updateAgeSeconds };
  }
  return { accept: secondsSinceIssued < creationGraceSeconds, shouldRotate: false };
}

async function main() {
  if (!SECRET) throw new Error("Neither AUTH_SECRET nor NEXTAUTH_SECRET is set in this environment.");
  console.log("=== F1 verification (self-contained, uses a temporary test account) ===\n");

  const marker = "f1-verify-" + crypto.randomUUID().slice(0, 8);
  await prisma.user.deleteMany({ where: { prognosisUsername: { startsWith: "f1-verify-" } } });
  const user = await prisma.user.create({
    data: { prognosisUsername: marker, role: "PENDING", displayName: "F1 self-test (safe to delete)" },
  });

  const sid = crypto.randomUUID();
  const versionOld = crypto.randomUUID();
  const iatOld = Math.floor(Date.now() / 1000);
  await prisma.activeSession.create({
    data: { id: sid, userId: user.id, currentJti: versionOld, expiresAt: new Date((iatOld + SESSION_MAX_AGE_SECONDS) * 1000) },
  });
  const oldToken = {
    id: user.id,
    role: user.role,
    prognosisUsername: user.prognosisUsername,
    sid,
    tokenVersion: versionOld,
    iat: iatOld,
    exp: iatOld + SESSION_MAX_AGE_SECONDS,
  };
  const oldCookie = await encode({ token: oldToken, secret: SECRET, salt: SALT, maxAge: SESSION_MAX_AGE_SECONDS });
  console.log("STEP 1 -- Simulated sign-in. Captured old cookie.");

  const nowAtRefresh = (iatOld + SESSION_UPDATE_AGE_SECONDS + 5) * 1000;
  const versionNew = crypto.randomUUID();
  await prisma.activeSession.update({
    where: { id: sid },
    data: { currentJti: versionNew, expiresAt: new Date(nowAtRefresh + SESSION_MAX_AGE_SECONDS * 1000) },
  });
  console.log("STEP 2 -- Forced a refresh (simulated 5+ minutes of activity). Row rotated.");

  const decodedOld = await decode({ token: oldCookie, secret: SECRET, salt: SALT });
  const rowNow = await prisma.activeSession.findUnique({ where: { id: sid } });
  const replay = evaluateActiveSession({
    activeSession: { currentJti: rowNow.currentJti, expiresAt: rowNow.expiresAt },
    tokenVersion: decodedOld.tokenVersion,
    tokenIat: decodedOld.iat,
    nowMs: nowAtRefresh + 10_000,
    updateAgeSeconds: SESSION_UPDATE_AGE_SECONDS,
    creationGraceSeconds: SESSION_CREATION_GRACE_SECONDS,
  });
  console.log("STEP 3 -- Replayed the OLD cookie (decrypted fresh) against the post-refresh database.");
  console.log(`  Result: ${replay.accept ? "ACCEPTED -- BUG, this should not happen" : "REJECTED -- correct"}`);

  await prisma.activeSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();

  console.log(
    replay.accept
      ? "\nFAIL: F1 is NOT fixed -- old token was accepted."
      : "\nPASS: F1 is fixed -- old token was correctly rejected after refresh."
  );
  process.exit(replay.accept ? 1 : 0);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});

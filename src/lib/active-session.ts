/**
 * Pure decision logic for single-active-token enforcement (see the
 * ActiveSession model in schema.prisma and the jwt callback in auth.ts),
 * pulled out of the callback so it can be unit-tested without a live
 * Prisma/Postgres/Prognosis stack — the thing that was missing the first
 * time this shipped, when it took down login three times in production.
 *
 * Root cause of that outage: the very first session read immediately after
 * sign-in occasionally found either no ActiveSession row yet, or one whose
 * jti hadn't visibly settled, and rejected it outright — indistinguishable,
 * from this function's viewpoint, from a genuinely stale/replayed token,
 * except for one thing: a truly stale token only exists *after* a later
 * refresh has minted a newer jti, which cannot happen within a few seconds
 * of the original sign-in. So a mismatch this early is far more likely a
 * transient read-after-write timing gap than an actual old token — hence
 * creationGraceSeconds: a token still inside that window is never rejected
 * for a mismatch, only for the separate/pre-existing sessionInvalidatedAt
 * check (explicit logout), which this function doesn't touch at all.
 */
export function evaluateActiveSession(params: {
  activeSession: { currentJti: string; expiresAt: Date } | null;
  tokenJti: string;
  /** Token's `iat` claim, in seconds since epoch (as Auth.js provides it). */
  tokenIat: number;
  nowMs: number;
  updateAgeSeconds: number;
  creationGraceSeconds: number;
}): { accept: boolean; shouldRotate: boolean } {
  const { activeSession, tokenJti, tokenIat, nowMs, updateAgeSeconds, creationGraceSeconds } = params;
  const secondsSinceIssued = nowMs / 1000 - tokenIat;

  if (activeSession && activeSession.currentJti === tokenJti) {
    // An expired row is unambiguous — no read-after-write timing race can
    // explain away a timestamp that has definitely passed, so this gets no
    // grace-period leniency regardless of how fresh the token is.
    if (activeSession.expiresAt.getTime() < nowMs) {
      return { accept: false, shouldRotate: false };
    }
    return { accept: true, shouldRotate: secondsSinceIssued > updateAgeSeconds };
  }

  // Row missing entirely, or present with a different jti — could be a
  // genuinely stale/replayed token, or could be this same login's row not
  // having visibly settled yet. Only the latter is possible within the
  // creation grace window, since a real stale jti requires a *later*
  // refresh to have already minted a newer one, which can't happen this
  // fast — so give it the benefit of the doubt there, reject otherwise.
  return { accept: secondsSinceIssued < creationGraceSeconds, shouldRotate: false };
}

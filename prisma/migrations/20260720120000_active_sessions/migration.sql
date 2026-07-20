-- A JWT session strategy is stateless: sessionInvalidatedAt (added in
-- 20260713190000_session_invalidation) covers explicit logout / forced
-- sign-out, but does nothing about the normal sliding-window refresh -- the
-- previous token stays independently valid until its own expiry even after
-- a newer one has been issued for the same login. This table tracks, per
-- login, the single jti that's currently valid, so the jwt callback in
-- src/lib/auth.ts can reject a stale token the moment a newer one exists
-- for that same session lineage, instead of waiting out its expiry.
CREATE TABLE "ActiveSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentJti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActiveSession_userId_idx" ON "ActiveSession"("userId");

-- AddForeignKey
ALTER TABLE "ActiveSession" ADD CONSTRAINT "ActiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Durable fixed-window rate-limit counters, replacing the in-memory limiter
-- so the login brute-force budget survives deploys/restarts and is shared
-- across instances. One row per bucket key; count incremented atomically via
-- INSERT ... ON CONFLICT, row reused once expiresAt passes.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

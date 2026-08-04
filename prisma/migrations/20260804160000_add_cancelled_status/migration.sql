-- Adds the CANCELLED case status and the mandatory reason that accompanies it.
-- Both changes are additive: a new enum value and a nullable column, so
-- existing rows and in-flight cases are unaffected.
ALTER TYPE "CaseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "NegotiationCase" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

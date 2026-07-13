-- MFA is now mandatory for every account (no per-user opt-in/opt-out), so
-- the toggle column is meaningless -- drop it. MfaCode/TrustedDevice and
-- their enum values are left untouched; only the User.mfaEnabled column
-- (and the code paths that read/wrote it) go away.
ALTER TABLE "User" DROP COLUMN "mfaEnabled";

-- Logout previously only cleared the cookie client-side; a copy of a JWT
-- session token captured before logout remained valid until its own
-- expiry (a stateless-JWT limitation). This column lets logout actually
-- invalidate the session server-side -- see the jwt callback in
-- src/lib/auth.ts.
ALTER TABLE "User" ADD COLUMN "sessionInvalidatedAt" TIMESTAMP(3);

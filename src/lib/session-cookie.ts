/**
 * Split out from session.ts so the Edge middleware (proxy.ts) can import
 * just the cookie name without pulling in the Prisma Client — Prisma
 * doesn't run in the Edge runtime, and importing it there would drag it
 * into that bundle for no reason (middleware only needs to check for the
 * cookie's presence, not read what's behind it).
 */
export const SESSION_COOKIE_NAME = "tnt_session";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";

/**
 * API routes sit outside middleware.ts's matcher (it excludes "/api"
 * entirely), so page-level role gating there does nothing here — a PENDING
 * (unapproved) account can otherwise call these directly, bypassing the
 * gating the UI enforces. Every data-returning API route must call this
 * instead of just checking `session?.user`.
 *
 * Returns the Session on success, or a NextResponse to return as-is on
 * failure — callers check `instanceof NextResponse` (a discriminated-union
 * return here doesn't narrow cleanly through destructuring).
 */
export async function requireApiSession(allowedRoles: Role[]): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

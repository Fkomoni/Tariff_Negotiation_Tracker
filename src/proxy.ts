import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

/**
 * Cookie-presence-only check. The session cookie is now an opaque token -
 * validating it for real (checking it against a database row, reading the
 * role for the redirects this file used to do) needs Prisma, which can't
 * run in the Edge runtime this middleware executes in. That's fine: this
 * is coarse UX routing, not the authorization boundary. Every real
 * page/Server Action/API route independently calls auth() in the Node.js
 * runtime and enforces its own check there - see (app)/layout.tsx for the
 * real signed-in and PENDING-role checks, and configuration/page.tsx and
 * negotiations/new/page.tsx for the real role checks this file used to do.
 *
 * /login is always let through here rather than bounced to /dashboard on
 * cookie presence: a stale cookie (naturally idle-expired, or left behind
 * after a failed logout) is "present" but not valid, and login/page.tsx
 * already does the real, database-backed check for "already signed in" -
 * redirecting here too, on presence alone, created a real bug: an invalid-
 * but-present cookie made /dashboard bounce to /login (real check fails)
 * and /login immediately bounce back to /dashboard (this file only checks
 * presence) - an infinite redirect loop, confirmed with curl. Letting
 * /login through unconditionally and leaving that check to the real one
 * removes the loop entirely.
 */
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login")) return NextResponse.next();

  const isLoggedIn = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Static files in public/ (logo, award-banner image, etc.) have no
  // trailing prefix like _next/static to exclude by - without matching on
  // file extension too, a request for e.g. /leadway-logo.png hits this
  // middleware, gets treated as an unauthenticated page request, and
  // 307-redirects to /login instead of serving the actual image. That
  // redirect loop is exactly why the login page's own logo silently
  // rendered as a broken image: the page and its own asset both go
  // through this same auth check.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};

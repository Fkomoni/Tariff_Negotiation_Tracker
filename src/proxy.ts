import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { Role } from "@prisma/client";

const ADMIN_ONLY = ["/configuration"];
const CONTACT_CENTER_OR_ADMIN = ["/negotiations/new"];
// /negotiations/queue has no role restriction here on purpose — Contact
// Centre needs to see case status too, and the page itself is read-only.
// The actual write boundary (updateCaseStatus, the Provider Team tab) is
// enforced independently, server-side, regardless of what this middleware
// does — see negotiations/[id]/page.tsx and case-actions.ts.

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Reads the session with getToken() rather than the auth() middleware
 * wrapper this used before. auth() routes through Auth.js's full session
 * machinery, which unconditionally re-signs and re-issues the session
 * cookie on every single call for JWT-strategy sessions (confirmed in
 * @auth/core's own source — there's no throttle on that path, unlike the
 * database-session strategy, which does throttle). Since this file runs on
 * nearly every request via the matcher below, that meant a fresh Set-Cookie
 * on every single page load, which repeatedly read as suspicious in
 * security review even though it was never itself a vulnerability.
 * getToken() only decodes the existing cookie — a pure read, no re-signing,
 * no Set-Cookie side effect — which is all this middleware ever actually
 * needed: this is coarse UX routing, not the authorization boundary (every
 * real page/Server Action/API route independently calls auth() in the
 * Node.js runtime and enforces its own check there, sessionInvalidatedAt
 * included). The session still refreshes normally through those real
 * auth() calls during actual use; it just no longer also refreshes on
 * every passive middleware pass.
 */
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  // Prefer the already-configured NEXTAUTH_URL over trusting this request's
  // own perceived protocol — Render/Cloudflare terminate TLS upstream, so
  // relying on a per-request header here would depend on proxy forwarding
  // behaving exactly as expected. NEXTAUTH_URL is a known-correct static
  // fact of this deployment (same reasoning already used in cors.ts's
  // getAllowedOrigins()), so there's nothing to get wrong at request time.
  const configuredUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const secureCookie = configuredUrl ? configuredUrl.startsWith("https:") : req.nextUrl.protocol === "https:";
  const token = await getToken({ req, secret, secureCookie });
  const isLoggedIn = !!token;

  if (pathname.startsWith("/login")) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token?.role as Role | undefined;

  if (role === "PENDING" && pathname !== "/pending-approval") {
    return NextResponse.redirect(new URL("/pending-approval", req.url));
  }

  if (matches(pathname, ADMIN_ONLY) && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (matches(pathname, CONTACT_CENTER_OR_ADMIN) && !["CONTACT_CENTER", "ADMIN"].includes(role ?? "")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Static files in public/ (logo, award-banner image, etc.) have no
  // trailing prefix like _next/static to exclude by — without matching on
  // file extension too, a request for e.g. /leadway-logo.png hits this
  // middleware, gets treated as an unauthenticated page request, and
  // 307-redirects to /login instead of serving the actual image. That
  // redirect loop is exactly why the login page's own logo silently
  // rendered as a broken image: the page and its own asset both go
  // through this same auth check.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};

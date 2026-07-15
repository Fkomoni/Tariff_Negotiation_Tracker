import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (pathname.startsWith("/login")) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.auth?.user?.role;

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
});

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

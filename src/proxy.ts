import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ADMIN_ONLY = ["/configuration"];
const CONTACT_CENTER_OR_ADMIN = ["/negotiations/new"];
const PROVIDER_TEAM_OR_ADMIN = ["/negotiations/queue"];

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

  if (matches(pathname, PROVIDER_TEAM_OR_ADMIN) && !["PROVIDER_TEAM", "ADMIN"].includes(role ?? "")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

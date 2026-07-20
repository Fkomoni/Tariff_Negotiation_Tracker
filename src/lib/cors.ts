import { NextRequest, NextResponse } from "next/server";

/**
 * This app has no legitimate cross-origin browser consumer — its own
 * frontend and its API routes share one origin. The allow-list is
 * therefore just this app's own configured origin(s), not a general
 * multi-tenant CORS policy.
 */
function getAllowedOrigins(): string[] {
  const origins = new Set<string>();
  if (process.env.NEXTAUTH_URL) origins.add(process.env.NEXTAUTH_URL.replace(/\/+$/, ""));
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
  }
  return Array.from(origins);
}

/**
 * Sets Access-Control-Allow-Origin only when the request's Origin exactly
 * matches an allow-listed origin — never reflects an arbitrary Origin back.
 * An origin that isn't on the list gets no CORS headers at all, which is
 * what tells the browser to withhold the response from that page's script.
 */
function applyCors(response: NextResponse, requestOrigin: string | null): NextResponse {
  // Set unconditionally, not just on the allowed branch — the response
  // genuinely varies by Origin either way (this app's origin gets the
  // header, everyone else doesn't), so a cache sitting in front of this
  // needs Origin in its cache key regardless of which branch was taken.
  response.headers.set("Vary", "Origin");
  if (requestOrigin && getAllowedOrigins().includes(requestOrigin)) {
    response.headers.set("Access-Control-Allow-Origin", requestOrigin);
  }
  return response;
}

type RouteHandler<Args extends unknown[]> = (req: NextRequest, ...args: Args) => Promise<NextResponse>;

/** Wraps a Route Handler so every response it returns (success or error)
 * gets the same allow-list-checked CORS header applied, without having to
 * touch each individual return statement inside the handler. */
export function withCors<Args extends unknown[]>(handler: RouteHandler<Args>): RouteHandler<Args> {
  return async (req, ...args) => {
    const res = await handler(req, ...args);
    return applyCors(res, req.headers.get("origin"));
  };
}

/** Explicit preflight response for the API routes' single allowed method —
 * same allow-list, no method/headers granted to an origin that isn't on it. */
export function corsPreflight(allowedMethods: string) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const res = new NextResponse(null, { status: 204 });
    applyCors(res, req.headers.get("origin"));
    res.headers.set("Access-Control-Allow-Methods", allowedMethods);
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.set("Access-Control-Max-Age", "86400");
    return res;
  };
}

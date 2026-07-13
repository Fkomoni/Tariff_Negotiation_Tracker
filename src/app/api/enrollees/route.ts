import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchEnrollees } from "@/lib/prognosis";
import { withCors, corsPreflight } from "@/lib/cors";
import { checkRateLimit } from "@/lib/rate-limit";

// Unlike providers/tariffs/treatments (served from an in-memory cache),
// enrollee lookups hit Prognosis live and can return real PII — so this is
// the one lookup route that needs its own throttle, well above normal
// single-lookup usage but well below what a scripted scrape needs.
const ENROLLEE_SEARCH_MAX = 30;
const ENROLLEE_SEARCH_WINDOW_MS = 60 * 1000;

export const GET = withCors(async (req: NextRequest) => {
  const session = await requireApiSession(["CONTACT_CENTER", "ADMIN"]);
  if (session instanceof NextResponse) return session;

  const limit = checkRateLimit(`enrollee-search:${session.user.id}`, ENROLLEE_SEARCH_MAX, ENROLLEE_SEARCH_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many searches — slow down and try again shortly." }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchEnrollees(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/enrollees] search failed:", err);
    return NextResponse.json({ error: "Failed to search enrollees" }, { status: 502 });
  }
});

export const OPTIONS = corsPreflight("GET");

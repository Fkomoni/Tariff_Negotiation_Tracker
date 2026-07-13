import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchTreatments } from "@/lib/procedure-catalog";
import { withCors, corsPreflight } from "@/lib/cors";

export const GET = withCors(async (req: NextRequest) => {
  const session = await requireApiSession(["CONTACT_CENTER", "ADMIN"]);
  if (session instanceof NextResponse) return session;

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const { results, totalMatches } = await searchTreatments(q);
    return NextResponse.json({ results, totalMatches });
  } catch (err) {
    console.error("[api/treatments] search failed:", err);
    return NextResponse.json({ error: "Failed to search treatments" }, { status: 502 });
  }
});

export const OPTIONS = corsPreflight("GET");

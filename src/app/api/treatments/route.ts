import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchTreatments } from "@/lib/procedure-catalog";

export async function GET(req: NextRequest) {
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
}

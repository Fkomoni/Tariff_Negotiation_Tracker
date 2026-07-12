import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTreatments } from "@/lib/procedure-catalog";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const { results, totalMatches } = await searchTreatments(q);
    return NextResponse.json({ results, totalMatches });
  } catch (err) {
    console.error("[api/treatments] search failed:", err);
    return NextResponse.json({ error: "Failed to search treatments" }, { status: 502 });
  }
}

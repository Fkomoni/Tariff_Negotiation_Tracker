import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchEnrollees } from "@/lib/prognosis";

export async function GET(req: NextRequest) {
  const session = await requireApiSession(["CONTACT_CENTER", "ADMIN"]);
  if (session instanceof NextResponse) return session;

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchEnrollees(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/enrollees] search failed:", err);
    return NextResponse.json({ error: "Failed to search enrollees" }, { status: 502 });
  }
}

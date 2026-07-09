import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchEnrollees } from "@/lib/prognosis";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchEnrollees(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/enrollees] search failed:", err);
    return NextResponse.json({ error: "Failed to search enrollees" }, { status: 502 });
  }
}

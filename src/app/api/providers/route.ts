import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchProviders } from "@/lib/prognosis";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchProviders(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/providers] search failed:", err);
    return NextResponse.json({ error: "Failed to search providers" }, { status: 502 });
  }
}

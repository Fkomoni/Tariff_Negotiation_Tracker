import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchProviders } from "@/lib/prognosis";
import { withCors, corsPreflight } from "@/lib/cors";

export const GET = withCors(async (req: NextRequest) => {
  const session = await requireApiSession(["CONTACT_CENTER", "ADMIN"]);
  if (session instanceof NextResponse) return session;

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchProviders(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/providers] search failed:", err);
    return NextResponse.json({ error: "Failed to search providers" }, { status: 502 });
  }
});

export const OPTIONS = corsPreflight("GET");

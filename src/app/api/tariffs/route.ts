import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchProviderTariff } from "@/lib/prognosis";
import { withCors, corsPreflight } from "@/lib/cors";

export const GET = withCors(async (req: NextRequest) => {
  const session = await requireApiSession(["CONTACT_CENTER", "ADMIN"]);
  if (session instanceof NextResponse) return session;

  const providerCode = req.nextUrl.searchParams.get("providerCode") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (!providerCode) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchProviderTariff(providerCode, q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/tariffs] search failed:", err);
    return NextResponse.json({ error: "Failed to search provider tariff" }, { status: 502 });
  }
});

export const OPTIONS = corsPreflight("GET");

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchProviderTariff } from "@/lib/prognosis";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

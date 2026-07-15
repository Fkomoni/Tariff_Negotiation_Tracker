import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { debugFetchProviderTariff } from "@/lib/prognosis";

/**
 * Admin-only inspection route: returns the untouched GetProviderTariff
 * response from Prognosis for one provider, optionally narrowed to entries
 * matching `q` (checked against the raw JSON of each entry). Exists to see
 * exactly what fields a real tariff line carries — e.g. confirming the
 * actual end-date field name — before deciding what to filter on in
 * searchProviderTariff. Not linked from any page; hit it directly.
 */
export async function GET(req: NextRequest) {
  const session = await requireApiSession(["ADMIN"]);
  if (session instanceof NextResponse) return session;

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!code) {
    return NextResponse.json({ error: "Pass ?code=<providerCode>" }, { status: 400 });
  }

  try {
    const payload = await debugFetchProviderTariff(code);

    let entries: unknown = payload;
    for (let depth = 0; depth < 4 && !Array.isArray(entries); depth++) {
      if (!entries || typeof entries !== "object") break;
      const p = entries as Record<string, unknown>;
      const envelopeKey = ["data", "Data", "tariff", "Tariff", "result", "Result", "items", "Items"].find((key) => key in p);
      if (!envelopeKey) break;
      entries = p[envelopeKey];
    }
    if (!Array.isArray(entries)) {
      return NextResponse.json({ note: "Response wasn't a list after unwrapping — returning as-is", raw: payload });
    }

    const filtered = q ? entries.filter((e) => JSON.stringify(e).toLowerCase().includes(q)) : entries;

    return NextResponse.json({
      totalEntries: entries.length,
      matchingEntries: filtered.length,
      shown: filtered.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lookup failed" }, { status: 502 });
  }
}

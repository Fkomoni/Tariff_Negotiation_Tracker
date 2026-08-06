import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { sendSms } from "@/lib/prognosis";

/**
 * Admin-only debug route: sends a real SMS through Prognosis's SendSms
 * endpoint to whatever `to` number is passed. Exists to test the
 * Source/SourceId/TemplateId workaround (see sendSms in lib/prognosis.ts)
 * straight from the browser instead of a shell script. Not linked from any
 * page; hit it directly.
 */
export async function GET(req: NextRequest) {
  // Operator tool only — never reachable in production, where an admin lured to
  // a crafted link (sameSite=lax lets the session cookie ride a top-level GET)
  // could otherwise fire a real, billable SMS to any number. Set
  // ENABLE_DEBUG_ROUTES=true in a non-prod environment to use it.
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_ROUTES !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await requireApiSession(["ADMIN"]);
  if (session instanceof NextResponse) return session;

  const to = req.nextUrl.searchParams.get("to") ?? "";
  const message = req.nextUrl.searchParams.get("message") ?? "Test SMS from Tariff Negotiation Tracker debug route.";
  if (!to) {
    return NextResponse.json({ error: "Pass ?to=<phone number>" }, { status: 400 });
  }

  try {
    await sendSms({ to, message, referenceNo: `debug-test-${Date.now()}` });
    return NextResponse.json({ ok: true, to, message });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "SendSms failed" }, { status: 502 });
  }
}

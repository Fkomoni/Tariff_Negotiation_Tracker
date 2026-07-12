import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildCaseExportRows, CASE_EXPORT_HEADER } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  const session = await requireApiSession(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM"]);
  if (session instanceof NextResponse) return session;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const loggedAt: { gte?: Date; lte?: Date } = {};
  if (from) loggedAt.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) loggedAt.lte = new Date(`${to}T23:59:59.999Z`);

  const cases = await prisma.negotiationCase.findMany({
    where: Object.keys(loggedAt).length > 0 ? { loggedAt } : undefined,
    include: { loggedBy: true, owner: true },
    orderBy: { loggedAt: "desc" },
  });

  const csv = toCsv(CASE_EXPORT_HEADER, buildCaseExportRows(cases));
  const filename = `tariff-negotiations${from ? `_from-${from}` : ""}${to ? `_to-${to}` : ""}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

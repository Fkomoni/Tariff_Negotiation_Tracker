import { NextRequest, NextResponse } from "next/server";
import { Urgency, CaseStatus, CaseType, Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildExportRows, CASE_EXPORT_COLUMNS } from "@/lib/reports";
import { toCsv } from "@/lib/csv";
import { withCors, corsPreflight } from "@/lib/cors";

const URGENCY_VALUES = new Set<string>(Object.values(Urgency));
const STATUS_VALUES = new Set<string>(Object.values(CaseStatus));
const CASE_TYPE_VALUES = new Set<string>(Object.values(CaseType));

export const GET = withCors(async (req: NextRequest) => {
  const session = await requireApiSession(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM"]);
  if (session instanceof NextResponse) return session;

  const params = req.nextUrl.searchParams;

  // Query params reach a Content-Disposition header below, so only accept
  // them in the exact shape a date input can produce — anything else (an
  // attempt at header/response splitting, or just a stray quote) is dropped
  // rather than interpolated.
  const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam && DATE_PARAM.test(fromParam) ? fromParam : null;
  const to = toParam && DATE_PARAM.test(toParam) ? toParam : null;

  const loggedAt: { gte?: Date; lte?: Date } = {};
  if (from) loggedAt.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) loggedAt.lte = new Date(`${to}T23:59:59.999Z`);

  // Each filter is validated against the actual enum members rather than
  // trusted as-is — an unrecognized value is silently dropped instead of
  // reaching Prisma, the same allowlist approach used for role checks
  // elsewhere in this app.
  const urgency = params.getAll("urgency").filter((v): v is Urgency => URGENCY_VALUES.has(v));
  const status = params.getAll("status").filter((v): v is CaseStatus => STATUS_VALUES.has(v));
  const caseType = params.getAll("caseType").filter((v): v is CaseType => CASE_TYPE_VALUES.has(v));
  const provider = params.get("provider")?.trim();

  const where: Prisma.NegotiationCaseWhereInput = {};
  if (Object.keys(loggedAt).length > 0) where.loggedAt = loggedAt;
  if (urgency.length > 0) where.urgency = { in: urgency };
  if (status.length > 0) where.status = { in: status };
  if (caseType.length > 0) where.caseType = { in: caseType };
  if (provider) where.providerName = { contains: provider, mode: "insensitive" };

  const cases = await prisma.negotiationCase.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { loggedBy: true, owner: true },
    orderBy: { loggedAt: "desc" },
  });

  // An unchecked checkbox is simply omitted by the browser, so "no columns
  // param at all" (a direct link, or every requested key being unknown)
  // falls back to every column rather than emitting a header with no data.
  const requestedKeys = params.getAll("columns");
  const columns =
    requestedKeys.length > 0
      ? CASE_EXPORT_COLUMNS.filter((c) => requestedKeys.includes(c.key))
      : CASE_EXPORT_COLUMNS;
  const selectedColumns = columns.length > 0 ? columns : CASE_EXPORT_COLUMNS;

  const csv = toCsv(selectedColumns.map((c) => c.label), buildExportRows(cases, selectedColumns));
  const filename = `tariff-negotiations${from ? `_from-${from}` : ""}${to ? `_to-${to}` : ""}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

export const OPTIONS = corsPreflight("GET");

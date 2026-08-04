import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  buildExportRows,
  CASE_EXPORT_COLUMNS,
  groupByProvider,
  groupByItem,
  tariffAgreedVsOriginal,
} from "@/lib/reports";
import { toCsv } from "@/lib/csv";
import { buildWorkbook } from "@/lib/xlsx";
import { parseReportFilters, describeFilters } from "@/lib/report-filters";
import { withCors, corsPreflight } from "@/lib/cors";

// exceljs needs Node APIs, so this route can't run on the edge runtime.
export const runtime = "nodejs";

export const GET = withCors(async (req: NextRequest) => {
  const session = await requireApiSession(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM"]);
  if (session instanceof NextResponse) return session;

  const params = req.nextUrl.searchParams;
  const filters = parseReportFilters(params);
  const { from, to } = filters;
  // "csv" keeps the original behaviour for anyone with a saved link; xlsx is
  // the default because it preserves number types, which CSV cannot.
  const format = params.get("format") === "csv" ? "csv" : "xlsx";

  const cases = await prisma.negotiationCase.findMany({
    where: filters.where,
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

  const stem = `tariff-negotiations${from ? `_from-${from}` : ""}${to ? `_to-${to}` : ""}`;
  const description = describeFilters(filters);

  if (format === "csv") {
    const csv = toCsv(
      selectedColumns.map((c) => c.label),
      buildExportRows(cases, selectedColumns)
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${stem}.csv"`,
      },
    });
  }

  // The workbook carries the summary tables too, not just the case list — the
  // per-provider and per-item breakdowns are what the Reports page is actually
  // read for, and rebuilding them by hand from a flat export is the tedious
  // work this is meant to remove.
  const byProvider = groupByProvider(cases);
  const byItem = groupByItem(cases);
  const agreed = tariffAgreedVsOriginal(cases);

  const workbook = await buildWorkbook(
    [
      {
        name: "Cases",
        columns: selectedColumns.map((c) => c.label),
        rows: buildExportRows(cases, selectedColumns),
      },
      {
        name: "By Provider",
        columns: ["Provider", "Cases", "Current Total", "Requested Total", "Extra Requested"],
        rows: byProvider.map((p) => [p.providerName, p.count, p.totalCurrent, p.totalRequested, p.totalExtra]),
        currencyColumns: [2, 3, 4],
      },
      {
        name: "By Item",
        columns: ["Service / Item", "Times Negotiated", "Total Extra Requested"],
        rows: byItem.map((i) => [i.item, i.count, i.totalExtra]),
        currencyColumns: [2],
      },
      {
        name: "Agreed vs Original",
        columns: ["Case", "Provider", "Original", "Final Agreed", "Change"],
        rows: agreed.map((r) => [r.case.caseNumber, r.case.providerName, r.current, r.final, r.diff]),
        currencyColumns: [2, 3, 4],
      },
    ],
    { title: "Provider Tariff Negotiation Report", description }
  );

  return new NextResponse(workbook.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${stem}.xlsx"`,
    },
  });
});

export const OPTIONS = corsPreflight("GET");

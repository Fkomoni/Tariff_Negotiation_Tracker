import { Urgency, CaseStatus, CaseType, Prisma } from "@prisma/client";
import { DISPLAY_TIME_ZONE } from "@/lib/domain";

/**
 * One definition of "which cases is this report about", shared by the Reports
 * page and every export format.
 *
 * Previously the page filtered on dates only while the CSV export had its own
 * separate set of controls, so what you saw on screen and what you downloaded
 * could describe different populations. Parsing both from the same function
 * means a filter change moves the tables and the exports together.
 */

const URGENCY_VALUES = new Set<string>(Object.values(Urgency));
const STATUS_VALUES = new Set<string>(Object.values(CaseStatus));
const CASE_TYPE_VALUES = new Set<string>(Object.values(CaseType));

/** Only the exact shape a date input produces. These reach a
 * Content-Disposition filename in the export routes, so anything else - an
 * attempt at header splitting, or just a stray quote - is dropped rather than
 * interpolated. */
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/** Lagos is UTC+1 year-round, so a Lagos calendar day starts at 23:00 UTC the
 * day before. Every timestamp in this app renders in Lagos, so the date range
 * has to be interpreted there too or a report for "today" quietly includes an
 * hour of yesterday. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

export interface ReportFilters {
  from: string | null;
  to: string | null;
  provider: string;
  caseType: CaseType[];
  urgency: Urgency[];
  status: CaseStatus[];
  where: Prisma.NegotiationCaseWhereInput | undefined;
  /** True when nothing is narrowing the report - used to label totals. */
  isUnfiltered: boolean;
}

export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam && DATE_PARAM.test(fromParam) ? fromParam : null;
  const to = toParam && DATE_PARAM.test(toParam) ? toParam : null;

  const loggedAt: { gte?: Date; lte?: Date } = {};
  if (from) loggedAt.gte = new Date(new Date(`${from}T00:00:00.000Z`).getTime() - LAGOS_OFFSET_MS);
  if (to) loggedAt.lte = new Date(new Date(`${to}T23:59:59.999Z`).getTime() - LAGOS_OFFSET_MS);

  // Validated against the actual enum members rather than trusted as-is - an
  // unrecognised value is dropped instead of reaching Prisma.
  const urgency = params.getAll("urgency").filter((v): v is Urgency => URGENCY_VALUES.has(v));
  const status = params.getAll("status").filter((v): v is CaseStatus => STATUS_VALUES.has(v));
  const caseType = params.getAll("caseType").filter((v): v is CaseType => CASE_TYPE_VALUES.has(v));
  const provider = params.get("provider")?.trim() ?? "";

  const where: Prisma.NegotiationCaseWhereInput = {};
  if (Object.keys(loggedAt).length > 0) where.loggedAt = loggedAt;
  if (urgency.length > 0) where.urgency = { in: urgency };
  if (status.length > 0) where.status = { in: status };
  if (caseType.length > 0) where.caseType = { in: caseType };
  if (provider) where.providerName = { contains: provider, mode: "insensitive" };

  return {
    from,
    to,
    provider,
    caseType,
    urgency,
    status,
    where: Object.keys(where).length > 0 ? where : undefined,
    isUnfiltered: Object.keys(where).length === 0,
  };
}

/** Re-serialises the active filters, so an export link carries exactly what
 * the page is showing. */
export function filtersToQuery(f: ReportFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.provider) p.set("provider", f.provider);
  for (const v of f.caseType) p.append("caseType", v);
  for (const v of f.urgency) p.append("urgency", v);
  for (const v of f.status) p.append("status", v);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/** Human-readable description of the active filters, for an export's header
 * row and the PDF title block - a downloaded file should say what it covers. */
export function describeFilters(f: ReportFilters): string {
  const parts: string[] = [];
  if (f.from || f.to) {
    parts.push(`Logged ${f.from ?? "any"} to ${f.to ?? "any"} (${DISPLAY_TIME_ZONE})`);
  }
  if (f.provider) parts.push(`Provider contains "${f.provider}"`);
  if (f.caseType.length) parts.push(`Case type: ${f.caseType.join(", ")}`);
  if (f.urgency.length) parts.push(`Urgency: ${f.urgency.join(", ")}`);
  if (f.status.length) parts.push(`Status: ${f.status.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "All cases, no filters applied";
}

import type { CaseStatus, NegotiationCase, ProviderManagementCategory, RequestType, Urgency, User } from "@prisma/client";
import { REQUEST_TYPE_LABELS, CASE_TYPE_LABELS, PM_CATEGORY_LABELS, URGENCY_LABELS, CASE_STATUS_LABELS } from "@/lib/domain";

export type ReportCase = NegotiationCase & { loggedBy: User; owner: User | null };

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** $ figures are 0/meaningless for PROVIDER_MANAGEMENT cases (no tariff
 * negotiation involved), so every $ breakdown below only looks at
 * TARIFF_UPDATE cases to avoid those zeros skewing totals or averages. */
function tariffOnly(cases: ReportCase[]): ReportCase[] {
  return cases.filter((c) => c.caseType === "TARIFF_UPDATE");
}

export interface PmCategoryCount {
  category: ProviderManagementCategory;
  label: string;
  count: number;
}

/** Counts how many PROVIDER_MANAGEMENT cases include each category — a
 * case with multiple categories counts once per category, not once
 * overall, so the breakdown reflects volume per issue type. */
export function pmCategoryCounts(cases: ReportCase[]): PmCategoryCount[] {
  const map = new Map<ProviderManagementCategory, number>();
  for (const c of cases) {
    if (c.caseType !== "PROVIDER_MANAGEMENT") continue;
    for (const category of c.pmCategories) {
      map.set(category, (map.get(category) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, label: PM_CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count);
}

export function groupByProvider(cases: ReportCase[]) {
  const map = new Map<string, { providerName: string; count: number; totalCurrent: number; totalRequested: number }>();
  for (const c of tariffOnly(cases)) {
    const entry = map.get(c.providerName) ?? { providerName: c.providerName, count: 0, totalCurrent: 0, totalRequested: 0 };
    entry.count += 1;
    entry.totalCurrent += toNum(c.currentTariff);
    entry.totalRequested += toNum(c.providerRequestedAmount);
    map.set(c.providerName, entry);
  }
  return Array.from(map.values())
    .map((e) => ({ ...e, totalExtra: e.totalRequested - e.totalCurrent }))
    .sort((a, b) => b.count - a.count);
}

export function groupByItem(cases: ReportCase[]) {
  const map = new Map<string, { item: string; count: number; totalExtra: number }>();
  for (const c of tariffOnly(cases)) {
    const entry = map.get(c.requestedItem) ?? { item: c.requestedItem, count: 0, totalExtra: 0 };
    entry.count += 1;
    entry.totalExtra += toNum(c.providerRequestedAmount) - toNum(c.currentTariff);
    map.set(c.requestedItem, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function agentLogCounts(cases: ReportCase[]) {
  const map = new Map<string, { name: string; count: number }>();
  for (const c of cases) {
    const name = c.loggedBy.displayName ?? c.loggedBy.prognosisUsername;
    const entry = map.get(c.loggedByUserId) ?? { name, count: 0 };
    entry.count += 1;
    map.set(c.loggedByUserId, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function providerTeamResolution(cases: ReportCase[]) {
  const closed = cases.filter((c) => c.completedAt && c.ownerUserId);
  const map = new Map<string, { name: string; count: number; totalMs: number }>();
  for (const c of closed) {
    const name = c.owner!.displayName ?? c.owner!.prognosisUsername;
    const entry = map.get(c.ownerUserId!) ?? { name, count: 0, totalMs: 0 };
    entry.count += 1;
    entry.totalMs += c.completedAt!.getTime() - c.loggedAt.getTime();
    map.set(c.ownerUserId!, entry);
  }
  return Array.from(map.values())
    .map((e) => ({ name: e.name, count: e.count, avgMs: e.totalMs / e.count }))
    .sort((a, b) => a.avgMs - b.avgMs);
}

export function delayBreakdown(cases: ReportCase[]) {
  const withFirstAction = cases.filter((c) => c.firstActionAt);
  const avgFirstActionMs =
    withFirstAction.length > 0
      ? withFirstAction.reduce((s, c) => s + (c.firstActionAt!.getTime() - c.loggedAt.getTime()), 0) / withFirstAction.length
      : null;

  const closed = cases.filter((c) => c.completedAt);
  const avgTotalMs =
    closed.length > 0 ? closed.reduce((s, c) => s + (c.completedAt!.getTime() - c.loggedAt.getTime()), 0) / closed.length : null;

  const closedWithFirstAction = closed.filter((c) => c.firstActionAt);
  const avgNegotiationMs =
    closedWithFirstAction.length > 0
      ? closedWithFirstAction.reduce((s, c) => s + (c.completedAt!.getTime() - c.firstActionAt!.getTime()), 0) /
        closedWithFirstAction.length
      : null;

  return { avgFirstActionMs, avgTotalMs, avgNegotiationMs };
}

export function tariffAgreedVsOriginal(cases: ReportCase[]) {
  return tariffOnly(cases)
    .filter((c) => c.status === "COMPLETED" && c.finalAgreedAmount)
    .map((c) => {
      const current = toNum(c.currentTariff);
      const final = toNum(c.finalAgreedAmount);
      const diff = final - current;
      const pct = current > 0 ? (diff / current) * 100 : 0;
      return { case: c, current, final, diff, pct };
    })
    .sort((a, b) => b.diff - a.diff);
}

export function urgentCasesTable(cases: ReportCase[]) {
  return cases
    .filter((c): c is ReportCase & { urgency: Urgency } => c.urgency === "URGENT" || c.urgency === "EMERGENCY")
    .map((c) => ({
      case: c,
      pendingMs: (c.completedAt ?? new Date()).getTime() - c.loggedAt.getTime(),
      isOpen: !c.completedAt,
    }))
    .sort((a, b) => b.pendingMs - a.pendingMs);
}

export interface TariffReviewCandidate {
  item: string;
  count: number;
  avgExtraPct: number;
  avgExtraAmount: number;
  providers: string[];
}

export function tariffReviewCandidates(cases: ReportCase[]): TariffReviewCandidate[] {
  const map = new Map<
    string,
    { item: string; count: number; totalExtraPct: number; totalExtraAmount: number; providers: Set<string> }
  >();

  for (const c of tariffOnly(cases)) {
    const current = toNum(c.currentTariff);
    const requested = toNum(c.providerRequestedAmount);
    if (current <= 0 || requested <= current) continue;

    const pct = ((requested - current) / current) * 100;
    const entry =
      map.get(c.requestedItem) ??
      { item: c.requestedItem, count: 0, totalExtraPct: 0, totalExtraAmount: 0, providers: new Set<string>() };
    entry.count += 1;
    entry.totalExtraPct += pct;
    entry.totalExtraAmount += requested - current;
    entry.providers.add(c.providerName);
    map.set(c.requestedItem, entry);
  }

  return Array.from(map.values())
    .map((e) => ({
      item: e.item,
      count: e.count,
      avgExtraPct: e.totalExtraPct / e.count,
      avgExtraAmount: e.totalExtraAmount / e.count,
      providers: Array.from(e.providers),
    }))
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count * b.avgExtraPct - a.count * a.avgExtraPct);
}

export const CLOSED: CaseStatus[] = ["COMPLETED", "DECLINED"];

export interface CaseExportColumn {
  key: string;
  label: string;
  value: (c: ReportCase) => string | number;
}

/** Registry driving the Reports page's column-picker checkboxes and the
 * CSV export route — each column here is one checkbox, in this order, and
 * `key` is the query-param value the checkbox submits. Add a column here
 * and it shows up in both places automatically. */
export const CASE_EXPORT_COLUMNS: CaseExportColumn[] = [
  { key: "caseNumber", label: "Case Number", value: (c) => c.caseNumber },
  { key: "caseType", label: "Case Type", value: (c) => CASE_TYPE_LABELS[c.caseType] },
  { key: "providerId", label: "Provider ID", value: (c) => c.providerId ?? "" },
  { key: "providerCode", label: "Provider Code", value: (c) => c.providerCode ?? "" },
  { key: "providerName", label: "Provider Name", value: (c) => c.providerName },
  { key: "loggedAt", label: "Date of Request", value: (c) => c.loggedAt.toISOString() },
  {
    key: "requestType",
    label: "Request Type",
    value: (c) => (c.caseType === "TARIFF_UPDATE" ? REQUEST_TYPE_LABELS[c.requestType as RequestType] : ""),
  },
  { key: "serviceType", label: "Service Type", value: (c) => c.serviceType ?? "" },
  { key: "requestedItem", label: "Service Requested", value: (c) => c.requestedItem },
  { key: "currentTariff", label: "Existing Price", value: (c) => (c.caseType === "TARIFF_UPDATE" ? toNum(c.currentTariff) : "") },
  {
    key: "providerRequestedAmount",
    label: "Requested Price",
    value: (c) => (c.caseType === "TARIFF_UPDATE" ? toNum(c.providerRequestedAmount) : ""),
  },
  { key: "finalAgreedAmount", label: "New Price", value: (c) => (c.finalAgreedAmount ? toNum(c.finalAgreedAmount) : "") },
  { key: "pmCategories", label: "PM Categories", value: (c) => c.pmCategories.map((cat) => PM_CATEGORY_LABELS[cat]).join("; ") },
  { key: "status", label: "Status", value: (c) => CASE_STATUS_LABELS[c.status] },
  { key: "urgency", label: "Urgency", value: (c) => URGENCY_LABELS[c.urgency] },
  { key: "loggedBy", label: "Agent That Logged", value: (c) => c.loggedBy.displayName ?? c.loggedBy.prognosisUsername },
  { key: "owner", label: "Agent That Handled", value: (c) => c.owner?.displayName ?? c.owner?.prognosisUsername ?? "" },
  {
    key: "tatMinutes",
    label: "TAT Minutes (Log to Completion)",
    value: (c) => (c.completedAt ? Math.round((c.completedAt.getTime() - c.loggedAt.getTime()) / 60000) : ""),
  },
  { key: "approvalReason", label: "Feedback from Provider Management", value: (c) => c.approvalReason ?? "" },
];

export function buildExportRows(cases: ReportCase[], columns: CaseExportColumn[]): (string | number)[][] {
  return cases.map((c) => columns.map((col) => col.value(c)));
}

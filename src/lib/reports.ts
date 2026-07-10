import type { CaseStatus, NegotiationCase, Urgency, User } from "@prisma/client";

export type ReportCase = NegotiationCase & { loggedBy: User; owner: User | null };

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

export function groupByProvider(cases: ReportCase[]) {
  const map = new Map<string, { providerName: string; count: number; totalCurrent: number; totalRequested: number }>();
  for (const c of cases) {
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
  for (const c of cases) {
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
  return cases
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

  for (const c of cases) {
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

export const CASE_EXPORT_HEADER = [
  "Case Number",
  "Provider ID",
  "Provider Code",
  "Provider Name",
  "Date of Request",
  "Service Type",
  "Service Requested",
  "Existing Price",
  "Requested Price",
  "New Price",
  "Status",
  "Agent That Logged",
  "Agent That Handled",
  "TAT Minutes (Log to Completion)",
  "Feedback from Provider Management",
];

export function buildCaseExportRows(cases: ReportCase[]): (string | number)[][] {
  return cases.map((c) => {
    const tatMs = c.completedAt ? c.completedAt.getTime() - c.loggedAt.getTime() : null;
    return [
      c.caseNumber,
      c.providerId ?? "",
      c.providerCode ?? "",
      c.providerName,
      c.loggedAt.toISOString(),
      c.serviceType,
      c.requestedItem,
      toNum(c.currentTariff),
      toNum(c.providerRequestedAmount),
      c.finalAgreedAmount ? toNum(c.finalAgreedAmount) : "",
      c.status,
      c.loggedBy.displayName ?? c.loggedBy.prognosisUsername,
      c.owner?.displayName ?? c.owner?.prognosisUsername ?? "",
      tatMs !== null ? Math.round(tatMs / 60000) : "",
      c.approvalReason ?? "",
    ];
  });
}

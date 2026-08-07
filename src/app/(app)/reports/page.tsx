import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, StatTile, inputClass } from "@/components/ui";
import { ReportIcon } from "@/components/icons";
import { formatCurrency, formatDuration, CASE_TYPE_LABELS, URGENCY_LABELS, CASE_STATUS_LABELS } from "@/lib/domain";
import { parseReportFilters, filtersToQuery, describeFilters } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/ReportFilterBar";
import {
  groupByProvider,
  groupByItem,
  agentLogCounts,
  providerTeamResolution,
  delayBreakdown,
  tariffAgreedVsOriginal,
  urgentCasesTable,
  pmCategoryCounts,
  CASE_EXPORT_COLUMNS,
} from "@/lib/reports";

export default async function ReportsPage(
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;

  // Same parser the export routes use, so the tables below and anything
  // downloaded describe the same population.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.set(k, v);
  }
  const filters = parseReportFilters(params);
  const exportQuery = filtersToQuery(filters);

  const cases = await prisma.negotiationCase.findMany({
    where: filters.where,
    include: { loggedBy: true, owner: true },
    orderBy: { loggedAt: "desc" },
  });

  const byProvider = groupByProvider(cases);
  const byItem = groupByItem(cases).slice(0, 10);
  const agents = agentLogCounts(cases);
  const teamResolution = providerTeamResolution(cases);
  const delay = delayBreakdown(cases);
  const agreedVsOriginal = tariffAgreedVsOriginal(cases).slice(0, 10);
  const urgentTable = urgentCasesTable(cases).slice(0, 10);
  const totalExtraRequested = byProvider.reduce((s, p) => s + p.totalExtra, 0);
  const tariffCases = cases.filter((c) => c.caseType === "TARIFF_UPDATE");
  const newServiceCount = tariffCases.filter((c) => c.requestType === "NEW_SERVICE").length;
  const tariffUpdateCount = tariffCases.length - newServiceCount;
  const pmCases = cases.filter((c) => c.caseType === "PROVIDER_MANAGEMENT");
  const pmCategories = pmCategoryCounts(cases);

  return (
    <>
      <Header
        title="Reports"
        subtitle="Provider Tariff Negotiation · Analytics"
        icon={<ReportIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-6 px-8 py-8">
        <ReportFilterBar filters={filters} exportQuery={exportQuery} matchCount={cases.length} />

        <Card>
          <CardHeader
            title="Choose export columns"
            subtitle="Which cases are included is set by the filters above - this picks the columns"
          />
          <form action="/api/reports/export" method="GET" className="space-y-4 px-5 py-4">
            {/* The applied filters ride along as hidden fields so this download
                covers the same cases as the tables on screen. Its own duplicate
                date/provider/status inputs were removed: two competing filter
                sets meant the export could describe a different population from
                the page it sat on. */}
            {filters.from && <input type="hidden" name="from" value={filters.from} />}
            {filters.to && <input type="hidden" name="to" value={filters.to} />}
            {filters.provider && <input type="hidden" name="provider" value={filters.provider} />}
            {filters.caseType.map((v) => (
              <input key={v} type="hidden" name="caseType" value={v} />
            ))}
            {filters.urgency.map((v) => (
              <input key={v} type="hidden" name="urgency" value={v} />
            ))}
            {filters.status.map((v) => (
              <input key={v} type="hidden" name="status" value={v} />
            ))}

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Columns to Include</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {CASE_EXPORT_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                    <input type="checkbox" name="columns" value={col.key} defaultChecked className="h-3.5 w-3.5 rounded border-ink-300" />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-glow hover:bg-brand-600"
              >
                Download CSV
              </button>
            </div>
          </form>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Extra Cost Requested" value={formatCurrency(totalExtraRequested)} tone="brand" />
          <StatTile label="Avg. Log → First Action" value={delay.avgFirstActionMs !== null ? formatDuration(delay.avgFirstActionMs) : "-"} hint="Internal response time" />
          <StatTile label="Avg. First Action → Completion" value={delay.avgNegotiationMs !== null ? formatDuration(delay.avgNegotiationMs) : "-"} hint="Provider negotiation time" />
          <StatTile label="Avg. Log → Completion" value={delay.avgTotalMs !== null ? formatDuration(delay.avgTotalMs) : "-"} hint="Total resolution time" />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Update Existing Tariff Requests" value={tariffUpdateCount} />
          <StatTile label="New Service Requests" value={newServiceCount} hint="Not previously priced on the provider" />
          <StatTile label="Other Provider Management Requests" value={pmCases.length} tone="brand" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Negotiations by Provider" />
            <Table
              head={["Provider", "Cases", "Current Total", "Requested Total", "Extra Requested"]}
              rows={byProvider.map((p) => [
                p.providerName,
                p.count,
                formatCurrency(p.totalCurrent),
                formatCurrency(p.totalRequested),
                <span key="x" className="font-semibold text-brand-600">
                  {formatCurrency(p.totalExtra)}
                </span>,
              ])}
            />
          </Card>

          <Card>
            <CardHeader title="Most Frequently Negotiated Items" />
            <Table
              head={["Item", "Times Negotiated", "Total Extra Requested"]}
              rows={byItem.map((i) => [i.item, i.count, formatCurrency(i.totalExtra)])}
            />
          </Card>

          <Card>
            <CardHeader title="Final Agreed vs Original Tariff" subtitle="Completed cases" />
            <Table
              head={["Case", "Provider", "Original", "Final Agreed", "Change"]}
              rows={agreedVsOriginal.map((r) => [
                r.case.caseNumber,
                r.case.providerName,
                formatCurrency(r.current),
                formatCurrency(r.final),
                <span key="x" className={r.diff > 0 ? "text-brand-600" : "text-emerald-600"}>
                  {r.diff > 0 ? "+" : ""}
                  {formatCurrency(r.diff)} ({r.pct.toFixed(1)}%)
                </span>,
              ])}
            />
          </Card>

          <Card>
            <CardHeader title="Urgent Cases - Delay Analysis" subtitle="Urgent & emergency, longest pending first" />
            <Table
              head={["Case", "Provider", "Urgency", "Status", "Time Pending"]}
              rows={urgentTable.map((r) => [
                r.case.caseNumber,
                r.case.providerName,
                r.case.urgency,
                r.isOpen ? "Open" : "Closed",
                formatDuration(r.pendingMs),
              ])}
            />
          </Card>

          <Card>
            <CardHeader title="Contact Centre Agent Logs" subtitle="Requests logged per agent" />
            <Table head={["Agent", "Requests Logged"]} rows={agents.map((a) => [a.name, a.count])} />
          </Card>

          <Card>
            <CardHeader title="Provider Team Resolution Time" subtitle="Average, fastest first" />
            <Table
              head={["Provider Team Member", "Cases Resolved", "Avg Resolution Time"]}
              rows={teamResolution.map((r) => [r.name, r.count, formatDuration(r.avgMs)])}
            />
          </Card>

          <Card>
            <CardHeader title="Provider Management Requests by Category" subtitle="A request can count toward more than one category" />
            <Table
              head={["Category", "Count"]}
              rows={pmCategories.map((c) => [c.label, c.count])}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-[12.5px] text-ink-400">No data yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <thead className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-5 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cidx) => (
                <td key={cidx} className="px-5 py-2.5 text-ink-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

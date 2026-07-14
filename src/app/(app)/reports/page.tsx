import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, StatTile } from "@/components/ui";
import { ReportIcon } from "@/components/icons";
import { formatCurrency, formatDuration } from "@/lib/domain";
import {
  groupByProvider,
  groupByItem,
  agentLogCounts,
  providerTeamResolution,
  delayBreakdown,
  tariffAgreedVsOriginal,
  urgentCasesTable,
  pmCategoryCounts,
} from "@/lib/reports";

export default async function ReportsPage(
  props: {
    searchParams: Promise<{ from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const from = searchParams.from;
  const to = searchParams.to;
  const loggedAt: { gte?: Date; lte?: Date } = {};
  if (from) loggedAt.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) loggedAt.lte = new Date(`${to}T23:59:59.999Z`);

  const cases = await prisma.negotiationCase.findMany({
    where: Object.keys(loggedAt).length > 0 ? { loggedAt } : undefined,
    include: { loggedBy: true, owner: true },
    orderBy: { loggedAt: "desc" },
  });

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const exportHref = `/api/reports/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

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
        <Card className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
          <form className="flex flex-wrap items-end gap-3" action="/reports">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">From</span>
              <input type="date" name="from" defaultValue={from ?? ""} className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px]" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">To</span>
              <input type="date" name="to" defaultValue={to ?? ""} className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px]" />
            </label>
            <button type="submit" className="rounded-lg bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800">
              Apply
            </button>
            {(from || to) && (
              <a href="/reports" className="text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">
                Clear
              </a>
            )}
          </form>
          <a
            href={exportHref}
            className="whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-glow hover:bg-brand-600"
          >
            Download CSV
          </a>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Extra Cost Requested" value={formatCurrency(totalExtraRequested)} tone="brand" />
          <StatTile label="Avg. Log → First Action" value={delay.avgFirstActionMs !== null ? formatDuration(delay.avgFirstActionMs) : "—"} hint="Internal response time" />
          <StatTile label="Avg. First Action → Completion" value={delay.avgNegotiationMs !== null ? formatDuration(delay.avgNegotiationMs) : "—"} hint="Provider negotiation time" />
          <StatTile label="Avg. Log → Completion" value={delay.avgTotalMs !== null ? formatDuration(delay.avgTotalMs) : "—"} hint="Total resolution time" />
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
            <CardHeader title="Urgent Cases — Delay Analysis" subtitle="Urgent & emergency, longest pending first" />
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

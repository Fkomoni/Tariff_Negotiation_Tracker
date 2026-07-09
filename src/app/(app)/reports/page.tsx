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
} from "@/lib/reports";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const cases = await prisma.negotiationCase.findMany({
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

  return (
    <>
      <Header
        title="Reports"
        subtitle="Provider Tariff Negotiation · Analytics"
        icon={<ReportIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-6 px-8 py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Extra Cost Requested" value={formatCurrency(totalExtraRequested)} tone="brand" />
          <StatTile label="Avg. Log → First Action" value={delay.avgFirstActionMs !== null ? formatDuration(delay.avgFirstActionMs) : "—"} hint="Internal response time" />
          <StatTile label="Avg. First Action → Completion" value={delay.avgNegotiationMs !== null ? formatDuration(delay.avgNegotiationMs) : "—"} hint="Provider negotiation time" />
          <StatTile label="Avg. Log → Completion" value={delay.avgTotalMs !== null ? formatDuration(delay.avgTotalMs) : "—"} hint="Total resolution time" />
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

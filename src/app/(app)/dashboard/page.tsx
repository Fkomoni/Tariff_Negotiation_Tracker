import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, StatTile, Badge } from "@/components/ui";
import { DashboardIcon } from "@/components/icons";
import Link from "next/link";
import {
  OPEN_STATUSES,
  URGENCY_BADGE,
  URGENCY_LABELS,
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  formatDateTime,
  formatDuration,
} from "@/lib/domain";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [totalToday, openCases, completedToday, urgentOpen, closedCases, providerGroups, itemGroups, oldestOpen] =
    await Promise.all([
      prisma.negotiationCase.count({ where: { loggedAt: { gte: startOfToday() } } }),
      prisma.negotiationCase.findMany({
        where: { status: { in: OPEN_STATUSES } },
        include: { loggedBy: true, owner: true },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.negotiationCase.count({ where: { status: "COMPLETED", completedAt: { gte: startOfToday() } } }),
      prisma.negotiationCase.findMany({
        where: { status: { in: OPEN_STATUSES }, urgency: { in: ["URGENT", "EMERGENCY"] } },
        include: { loggedBy: true, owner: true },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.negotiationCase.findMany({
        where: { completedAt: { not: null } },
        select: { loggedAt: true, completedAt: true },
      }),
      prisma.negotiationCase.groupBy({
        by: ["providerName"],
        _count: { providerName: true },
        orderBy: { _count: { providerName: "desc" } },
        take: 5,
      }),
      prisma.negotiationCase.groupBy({
        by: ["requestedItem"],
        _count: { requestedItem: true },
        orderBy: { _count: { requestedItem: "desc" } },
        take: 5,
      }),
      prisma.negotiationCase.findFirst({
        where: { status: { in: OPEN_STATUSES } },
        orderBy: { loggedAt: "asc" },
      }),
    ]);

  const avgResolutionMs =
    closedCases.length > 0
      ? closedCases.reduce((sum, c) => sum + (c.completedAt!.getTime() - c.loggedAt.getTime()), 0) / closedCases.length
      : null;

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Provider Tariff Negotiation · Overview"
        icon={<DashboardIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-6 px-8 py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Logged Today" value={totalToday} />
          <StatTile label="Open Requests" value={openCases.length} tone="brand" />
          <StatTile label="Completed Today" value={completedToday} tone="good" />
          <StatTile
            label="Avg Resolution Time"
            value={avgResolutionMs !== null ? formatDuration(avgResolutionMs) : "—"}
          />
          <StatTile
            label="Longest Pending Case"
            value={oldestOpen ? formatDuration(Date.now() - oldestOpen.loggedAt.getTime()) : "—"}
            hint={oldestOpen ? `${oldestOpen.caseNumber} · ${oldestOpen.providerName}` : undefined}
            tone="warn"
          />
          <StatTile label="Urgent Unresolved" value={urgentOpen.length} tone={urgentOpen.length > 0 ? "warn" : "default"} />
          <StatTile label="Top Provider" value={providerGroups[0]?.providerName ?? "—"} hint={providerGroups[0] ? `${providerGroups[0]._count.providerName} cases` : undefined} />
          <StatTile label="Top Item" value={itemGroups[0]?.requestedItem ?? "—"} hint={itemGroups[0] ? `${itemGroups[0]._count.requestedItem} cases` : undefined} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Top Negotiated Providers" />
            <ul className="divide-y divide-ink-100">
              {providerGroups.length === 0 && <li className="px-5 py-6 text-[12.5px] text-ink-400">No data yet.</li>}
              {providerGroups.map((g, idx) => (
                <li key={g.providerName} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-ink-800">
                    <span className="mr-2 text-ink-400">#{idx + 1}</span>
                    {g.providerName}
                  </span>
                  <span className="text-[12.5px] font-bold text-ink-900">{g._count.providerName}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Top Negotiated Services / Items" />
            <ul className="divide-y divide-ink-100">
              {itemGroups.length === 0 && <li className="px-5 py-6 text-[12.5px] text-ink-400">No data yet.</li>}
              {itemGroups.map((g, idx) => (
                <li key={g.requestedItem} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-ink-800">
                    <span className="mr-2 text-ink-400">#{idx + 1}</span>
                    {g.requestedItem}
                  </span>
                  <span className="text-[12.5px] font-bold text-ink-900">{g._count.requestedItem}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card>
          <CardHeader title="Urgent Unresolved Cases" subtitle="Needs immediate attention" />
          {urgentOpen.length === 0 ? (
            <p className="px-5 py-6 text-[12.5px] text-ink-400">No urgent cases currently open.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {urgentOpen.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <Link href={`/negotiations/${c.id}`} className="text-[13px] font-semibold text-ink-900 hover:underline">
                      {c.caseNumber} · {c.providerName}
                    </Link>
                    <p className="text-[11.5px] text-ink-400">
                      {c.enrolleeName} · logged {formatDateTime(c.loggedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={URGENCY_BADGE[c.urgency]}>{URGENCY_LABELS[c.urgency]}</Badge>
                    <Badge className={CASE_STATUS_BADGE[c.status]}>{CASE_STATUS_LABELS[c.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

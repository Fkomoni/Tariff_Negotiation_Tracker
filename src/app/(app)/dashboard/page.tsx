import Link from "next/link";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card, Badge } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { getDashboardData, type RankRow } from "@/lib/dashboard";
import {
  LogIcon,
  QueueIcon,
  ReportIcon,
  DownloadIcon,
  RefreshIcon,
  CheckMarkIcon,
  ClockIcon,
  HourglassIcon,
  AlertIcon,
  BuildingIcon,
  TagIcon,
  BellIcon,
  UserIcon,
  CheckIcon,
} from "@/components/icons";
import {
  URGENCY_BADGE,
  URGENCY_LABELS,
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  DISPLAY_TIME_ZONE,
  formatDateTime,
  formatDuration,
} from "@/lib/domain";
import type { CaseStatus } from "@prisma/client";

/** Toolbar button. `primary` is the one action that creates something. */
function ToolButton({
  href,
  icon,
  label,
  variant = "secondary",
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors ${
        variant === "primary"
          ? "bg-accent text-white shadow-cta hover:bg-accent-600"
          : "border border-line bg-white text-navy-700 hover:bg-surface-muted"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-600 hover:bg-surface-muted"
    >
      View all
    </Link>
  );
}

/** Phrases a whole-number change against yesterday. */
function deltaNote(delta: number | null): { note: string; tone: "good" | "bad" | "neutral" } {
  if (delta === null || delta === 0) return { note: "Same as yesterday", tone: "neutral" };
  const word = delta > 0 ? "more" : "fewer";
  return { note: `${Math.abs(delta)} ${word} than yesterday`, tone: delta > 0 ? "good" : "bad" };
}

/** Ranked list with a share-of-total bar, used for providers and services. */
function RankCard({
  title,
  rows,
  viewAllHref,
  columnLabel,
}: {
  title: string;
  rows: RankRow[];
  viewAllHref: string;
  columnLabel: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-[14px] font-bold text-navy-900">{title}</h2>
        <ViewAll href={viewAllHref} />
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-6 text-[12.5px] text-navy-400">Nothing negotiated yet.</p>
      ) : (
        <table className="w-full text-left text-[12.5px]">
          <thead className="border-y border-line-subtle bg-surface-muted text-[10px] font-bold uppercase tracking-wide text-navy-400">
            <tr>
              <th className="w-10 px-5 py-2.5">#</th>
              <th className="px-2 py-2.5">{columnLabel}</th>
              <th className="w-16 px-2 py-2.5 text-right">Cases</th>
              <th className="w-[180px] px-5 py-2.5">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.map((row, i) => (
              <tr key={row.label}>
                <td className="px-5 py-3 font-semibold text-navy-400">#{i + 1}</td>
                <td className="px-2 py-3 text-navy-800">{row.label}</td>
                <td className="px-2 py-3 text-right font-semibold text-navy-900">{row.count}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="block h-full rounded-full bg-accent"
                        // Floored at 2% so a single case still shows a mark
                        // rather than an apparently empty track.
                        style={{ width: `${Math.max(row.percent, 2)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-[11px] font-semibold text-navy-500">{row.percent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

const ACTIVITY_STYLE: Record<string, { icon: React.ReactNode; dot: string; tile: string }> = {
  STATUS_CHANGE: { icon: <CheckIcon className="h-4 w-4" />, dot: "bg-emerald-500", tile: "bg-emerald-50 text-emerald-600" },
  NOTE: { icon: <LogIcon className="h-4 w-4" />, dot: "bg-violet-500", tile: "bg-violet-50 text-violet-600" },
  NOTIFICATION: { icon: <BellIcon className="h-4 w-4" />, dot: "bg-accent", tile: "bg-accent-50 text-accent" },
  OWNER_CHANGE: { icon: <UserIcon className="h-4 w-4" />, dot: "bg-sky-500", tile: "bg-sky-50 text-sky-600" },
};

const ACTIVITY_VERB: Record<string, string> = {
  STATUS_CHANGE: "updated the status",
  NOTE: "added a note",
  NOTIFICATION: "sent a member notification",
  OWNER_CHANGE: "claimed the case",
};

const timeOnly = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: DISPLAY_TIME_ZONE,
});

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const d = await getDashboardData();
  // Lagos calendar date, so a "today" link into Reports selects the same day the
  // cards counted.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
  const logged = deltaNote(d.loggedToday.deltaFromYesterday);
  const completed = deltaNote(d.completedToday.deltaFromYesterday);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Provider Tariff Negotiation · Overview"
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
        alertCount={d.urgentUnresolved.value}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {["CONTACT_CENTER", "ADMIN"].includes(session.user.role) && (
              <ToolButton
                href="/negotiations/new"
                icon={<LogIcon className="h-4 w-4" />}
                label="Log Negotiation"
                variant="primary"
              />
            )}
            <ToolButton href="/negotiations/queue" icon={<QueueIcon className="h-4 w-4" />} label="Open Queue" />
            <ToolButton href="/reports" icon={<ReportIcon className="h-4 w-4" />} label="Reports" />
            <ToolButton href="/reports" icon={<DownloadIcon className="h-4 w-4" />} label="Export" />
            {/* A plain link back to this page. Every figure here is computed in
                a server component, so navigating re-runs the queries — this is
                a real refresh, not a decorative button. */}
            <ToolButton href="/dashboard" icon={<RefreshIcon className="h-4 w-4" />} label="Refresh" />
          </div>
        }
      />

      <div className="flex-1 space-y-5 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            id="logged"
            href={`/reports?from=${today}&to=${today}`}
            tone="info"
            icon={<LogIcon className="h-[19px] w-[19px]" />}
            label="Logged Today"
            value={d.loggedToday.value}
            series={d.loggedToday.series}
            note={logged.note}
            noteTone={logged.tone}
          />

          <StatCard
            id="open"
            href="/negotiations/queue"
            tone="danger"
            icon={<QueueIcon className="h-[19px] w-[19px]" />}
            label="Open Requests"
            value={d.openRequests.value}
            series={d.openRequests.series}
            note="Currently active"
          />

          <StatCard
            id="completed"
            href="/negotiations/completed"
            tone="success"
            icon={<CheckMarkIcon className="h-[19px] w-[19px]" />}
            label="Completed Today"
            value={d.completedToday.value}
            series={d.completedToday.series}
            note={completed.note}
            noteTone={completed.tone}
          />

          <StatCard
            id="avg"
            href="/reports"
            tone="info"
            icon={<ClockIcon className="h-[19px] w-[19px]" />}
            label="Avg Resolution Time"
            value={d.avgResolution.ms === null ? "—" : formatDuration(d.avgResolution.ms)}
            series={d.avgResolution.series}
            note={
              d.avgResolution.deltaPct === null
                ? "Across all settled cases"
                : `${Math.abs(Math.round(d.avgResolution.deltaPct))}% ${
                    d.avgResolution.deltaPct > 0 ? "slower" : "faster"
                  } than yesterday`
            }
            // Faster is the good direction here, so the sign reads the opposite
            // way round from the count cards above.
            noteTone={d.avgResolution.deltaPct === null ? "neutral" : d.avgResolution.deltaPct > 0 ? "bad" : "good"}
          />

          <StatCard
            id="longest"
            href={d.longestPending.case ? `/negotiations/${d.longestPending.case.id}` : undefined}
            tone="accent"
            icon={<HourglassIcon className="h-[19px] w-[19px]" />}
            label="Longest Pending Case"
            value={d.longestPending.ms === null ? "—" : formatDuration(d.longestPending.ms)}
            series={d.longestPending.series}
            sublabel={
              d.longestPending.case ? (
                <>
                  <span className="font-semibold text-navy-700">{d.longestPending.case.caseNumber}</span>
                  <span className="block truncate">{d.longestPending.case.providerName}</span>
                </>
              ) : null
            }
            note={d.longestPending.case ? "Oldest unresolved request" : "Nothing pending"}
          />

          <StatCard
            id="urgent"
            href="/negotiations/queue?urgency=PRIORITY"
            tone="warning"
            icon={<AlertIcon className="h-[19px] w-[19px]" />}
            label="Urgent Unresolved"
            value={d.urgentUnresolved.value}
            series={d.urgentUnresolved.series}
            note={d.urgentUnresolved.value > 0 ? "Requires immediate attention" : "Nothing urgent outstanding"}
            noteTone={d.urgentUnresolved.value > 0 ? "bad" : "neutral"}
          />

          <StatCard
            id="topprovider"
            href="/reports"
            tone="violet"
            icon={<BuildingIcon className="h-[19px] w-[19px]" />}
            label="Top Provider"
            value={d.topProvider?.label ?? "—"}
            series={d.topProvider?.series}
            note={d.topProvider ? `${d.topProvider.count} case${d.topProvider.count === 1 ? "" : "s"}` : "No cases yet"}
          />

          <StatCard
            id="topitem"
            href="/tariff-review"
            tone="teal"
            icon={<TagIcon className="h-[19px] w-[19px]" />}
            label="Top Item"
            value={d.topItem?.label ?? "—"}
            series={d.topItem?.series}
            note={d.topItem ? `${d.topItem.count} case${d.topItem.count === 1 ? "" : "s"}` : "No cases yet"}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RankCard title="Top Negotiated Providers" rows={d.topProviders} viewAllHref="/reports" columnLabel="Provider" />
          <RankCard
            title="Top Negotiated Services / Items"
            rows={d.topItems}
            viewAllHref="/tariff-review"
            columnLabel="Service / Item"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[14px] font-bold text-navy-900">Urgent Unresolved Cases</h2>
              <ViewAll href="/negotiations/queue?urgency=PRIORITY" />
            </div>

            {d.urgentOpen.length === 0 ? (
              <p className="px-5 pb-6 text-[12.5px] text-navy-400">Nothing urgent is outstanding.</p>
            ) : (
              <ul className="divide-y divide-line-subtle border-t border-line-subtle">
                {d.urgentOpen.map((c) => (
                  <li key={c.id} className="border-l-[3px] border-accent">
                    <Link
                      href={`/negotiations/${c.id}`}
                      className="flex items-start gap-3 px-5 py-3 hover:bg-surface-muted/60"
                    >
                      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent">
                        <BuildingIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-navy-900">
                          {c.caseNumber} · {c.providerName}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-navy-500">
                          {c.loggedBy.displayName ?? c.loggedBy.prognosisUsername} · Logged {formatDateTime(c.loggedAt)}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 gap-1.5">
                        <Badge className={URGENCY_BADGE[c.urgency]}>{URGENCY_LABELS[c.urgency]}</Badge>
                        <Badge className={CASE_STATUS_BADGE[c.status]}>{CASE_STATUS_LABELS[c.status]}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[14px] font-bold text-navy-900">Recent Activity</h2>
              <ViewAll href="/audit-log" />
            </div>

            {d.recentActivity.length === 0 ? (
              <p className="px-5 pb-6 text-[12.5px] text-navy-400">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line-subtle border-t border-line-subtle">
                {d.recentActivity.map((u) => {
                  const style = ACTIVITY_STYLE[u.type] ?? ACTIVITY_STYLE.NOTE;
                  const actor = u.user.displayName ?? u.user.prognosisUsername;
                  return (
                    <li key={u.id}>
                      <Link
                        href={`/negotiations/${u.case.id}`}
                        className="flex items-start gap-3 px-5 py-3 hover:bg-surface-muted/60"
                      >
                        <span className="mt-1.5 w-10 flex-shrink-0 text-[11px] font-semibold text-navy-400">
                          {timeOnly.format(u.createdAt)}
                        </span>
                        <span className="relative mt-0.5 flex-shrink-0">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${style.tile}`}>
                            {style.icon}
                          </span>
                          <span
                            className={`absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${style.dot}`}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] text-navy-800">
                            <span className="font-semibold">{actor}</span>{" "}
                            {u.newStatus
                              ? `set ${CASE_STATUS_LABELS[u.newStatus as CaseStatus]}`
                              : ACTIVITY_VERB[u.type] ?? "updated the case"}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-navy-500">
                            {u.case.caseNumber} · {u.case.providerName}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card, CardHeader, Badge } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { getDashboardData } from "@/lib/dashboard";
import {
  DashboardIcon,
  ReportIcon,
  DownloadIcon,
  RefreshIcon,
  LogIcon,
  QueueIcon,
  CheckMarkIcon,
  ClockIcon,
  HourglassIcon,
  AlertIcon,
  BuildingIcon,
  TagIcon,
} from "@/components/icons";
import Link from "next/link";
import {
  DISPLAY_TIME_ZONE,
  URGENCY_BADGE,
  URGENCY_LABELS,
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  formatDateTime,
  formatDuration,
} from "@/lib/domain";

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

/** Phrases a whole-number change against yesterday. */
function deltaNote(delta: number | null): { note: string; tone: "good" | "bad" | "neutral" } {
  if (delta === null || delta === 0) return { note: "Same as yesterday", tone: "neutral" };
  const word = delta > 0 ? "more" : "fewer";
  return { note: `${Math.abs(delta)} ${word} than yesterday`, tone: delta > 0 ? "good" : "bad" };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const d = await getDashboardData();
  // Lagos calendar date, so a "today" link into Reports selects the same day
  // the cards counted.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
  const logged = deltaNote(d.loggedToday.deltaFromYesterday);
  const completed = deltaNote(d.completedToday.deltaFromYesterday);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Provider Tariff Negotiation · Overview"
        icon={<DashboardIcon />}
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
                a server component, so navigating re-runs the queries — a real
                refresh, not a decorative button. */}
            <ToolButton href="/dashboard" icon={<RefreshIcon className="h-4 w-4" />} label="Refresh" />
          </div>
        }
      />

      <div className="flex-1 space-y-6 px-8 py-8">
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
                : `${Math.abs(Math.round(d.avgResolution.deltaPct))}% ${d.avgResolution.deltaPct > 0 ? "slower" : "faster"} than yesterday`
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
            note={
              d.topProvider ? `${d.topProvider.count} case${d.topProvider.count === 1 ? "" : "s"}` : "No cases yet"
            }
          />
          <StatCard
            id="topitem"
            href="/tariff-review"
            tone="teal"
            icon={<TagIcon className="h-[19px] w-[19px]" />}
            label="Top Item"
            value={d.topItem?.label ?? "—"}
            series={d.topItem?.series}
            note={
              d.topItem ? `${d.topItem.count} case${d.topItem.count === 1 ? "" : "s"}` : "No cases yet"
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Top Negotiated Providers" />
            <ul className="divide-y divide-ink-100">
              {d.topProviders.length === 0 && <li className="px-5 py-6 text-[12.5px] text-ink-400">No data yet.</li>}
              {d.topProviders.map((g, idx) => (
                <li key={g.label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-ink-800">
                    <span className="mr-2 text-ink-400">#{idx + 1}</span>
                    {g.label}
                  </span>
                  <span className="text-[12.5px] font-bold text-ink-900">{g.count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Top Negotiated Services / Items" />
            <ul className="divide-y divide-ink-100">
              {d.topItems.length === 0 && <li className="px-5 py-6 text-[12.5px] text-ink-400">No data yet.</li>}
              {d.topItems.map((g, idx) => (
                <li key={g.label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-ink-800">
                    <span className="mr-2 text-ink-400">#{idx + 1}</span>
                    {g.label}
                  </span>
                  <span className="text-[12.5px] font-bold text-ink-900">{g.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card>
          <CardHeader title="Urgent Unresolved Cases" subtitle="Needs immediate attention" />
          {d.urgentOpen.length === 0 ? (
            <p className="px-5 py-6 text-[12.5px] text-ink-400">No urgent cases currently open.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {d.urgentOpen.map((c) => (
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

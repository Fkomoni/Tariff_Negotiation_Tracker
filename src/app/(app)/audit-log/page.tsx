import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import { ShieldIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/domain";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Sign In",
  ROLE_CHANGE: "Role Change",
  STATUS_CHANGE: "Status Update",
  NOTE: "Note",
  NOTIFICATION: "Member Notification",
  OWNER_CHANGE: "Ownership",
};

interface UnifiedEntry {
  id: string;
  timestamp: Date;
  actorName: string;
  action: string;
  detail: string;
  caseNumber?: string;
  caseId?: string;
}

export default async function AuditLogPage(
  props: {
    searchParams: Promise<{ from?: string; to?: string; actor?: string; action?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const from = searchParams.from;
  const to = searchParams.to;
  const actorFilter = searchParams.actor;
  const actionFilter = searchParams.action;

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  const hasDateFilter = Object.keys(createdAt).length > 0;

  const [users, auditLogs, caseUpdates] = await Promise.all([
    prisma.user.findMany({ orderBy: { prognosisUsername: "asc" } }),
    prisma.auditLog.findMany({
      where: {
        ...(hasDateFilter ? { createdAt } : {}),
        ...(actorFilter ? { actorUserId: actorFilter } : {}),
      },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.caseUpdate.findMany({
      where: {
        ...(hasDateFilter ? { createdAt } : {}),
        ...(actorFilter ? { userId: actorFilter } : {}),
      },
      include: { user: true, case: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  let entries: UnifiedEntry[] = [
    ...auditLogs.map((a) => ({
      id: a.id,
      timestamp: a.createdAt,
      actorName: a.actor?.displayName ?? a.actor?.prognosisUsername ?? "System",
      action: a.action,
      detail: a.summary,
    })),
    ...caseUpdates.map((u) => ({
      id: u.id,
      timestamp: u.createdAt,
      actorName: u.user.displayName ?? u.user.prognosisUsername,
      action: u.type,
      detail: u.note ?? (u.newStatus ? `${u.previousStatus ? `${u.previousStatus} → ` : ""}${u.newStatus}` : ""),
      caseNumber: u.case.caseNumber,
      caseId: u.caseId,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (actionFilter) {
    entries = entries.filter((e) => e.action === actionFilter);
  }
  entries = entries.slice(0, 500);

  function buildHref(overrides: { from?: string; to?: string; actor?: string; action?: string }) {
    const params = new URLSearchParams();
    const next = { from, to, actor: actorFilter, action: actionFilter, ...overrides };
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.actor) params.set("actor", next.actor);
    if (next.action) params.set("action", next.action);
    return `/audit-log?${params.toString()}`;
  }

  return (
    <>
      <Header
        title="Audit Log"
        subtitle="Every sign-in, role change, and case action, in one place"
        icon={<ShieldIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-5 px-8 py-8">
        <Card className="flex flex-wrap items-end gap-3 px-5 py-4">
          <form className="flex flex-wrap items-end gap-3" action="/audit-log">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">From</span>
              <input type="date" name="from" defaultValue={from ?? ""} className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px]" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">To</span>
              <input type="date" name="to" defaultValue={to ?? ""} className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px]" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">Actor</span>
              <select name="actor" defaultValue={actorFilter ?? ""} className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px]">
                <option value="">All staff</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? u.prognosisUsername}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">Action</span>
              <select name="action" defaultValue={actionFilter ?? ""} className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px]">
                <option value="">All actions</option>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800">
              Apply
            </button>
            {(from || to || actorFilter || actionFilter) && (
              <Link href="/audit-log" className="text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">
                Clear
              </Link>
            )}
          </form>
        </Card>

        <Card>
          {entries.length === 0 ? (
            <p className="px-6 py-16 text-center text-[13px] text-ink-400">No activity matches this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="border-b border-ink-100 bg-ink-100/50 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-5 py-2.5">Time</th>
                    <th className="px-5 py-2.5">Actor</th>
                    <th className="px-5 py-2.5">Action</th>
                    <th className="px-5 py-2.5">Detail</th>
                    <th className="px-5 py-2.5">Case</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-500">{formatDateTime(e.timestamp)}</td>
                      <td className="px-5 py-2.5 font-semibold text-ink-900">{e.actorName}</td>
                      <td className="px-5 py-2.5">
                        <Link
                          href={buildHref({ action: e.action })}
                          className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-ink-200"
                        >
                          {ACTION_LABELS[e.action] ?? e.action}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 text-ink-700">{e.detail || "—"}</td>
                      <td className="px-5 py-2.5">
                        {e.caseId ? (
                          <Link href={`/negotiations/${e.caseId}`} className="font-semibold text-brand-600 hover:underline">
                            {e.caseNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

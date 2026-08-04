import type { CaseStatus, CaseUpdate, User } from "@prisma/client";
import { Badge } from "@/components/ui";
import { CASE_STATUS_BADGE, CASE_STATUS_LABELS, ROLE_LABELS, formatDateParts } from "@/lib/domain";

type TimelineEntry = CaseUpdate & { user: User };

const TYPE_LABEL: Record<string, string> = {
  STATUS_CHANGE: "Status update",
  NOTE: "Note added",
  NOTIFICATION: "Member notified",
  OWNER_CHANGE: "Ownership changed",
};

const TYPE_BADGE: Record<string, string> = {
  NOTE: "bg-surface-muted text-navy-600",
  NOTIFICATION: "bg-sky-100 text-sky-800",
  OWNER_CHANGE: "bg-indigo-100 text-indigo-800",
};

/**
 * Case history, newest first.
 *
 * `limit` renders only the most recent entries with a count of what's hidden,
 * so the overview can stay short while the Provider Team tab shows everything.
 */
export function Timeline({ updates, limit }: { updates: TimelineEntry[]; limit?: number }) {
  if (updates.length === 0) {
    return <p className="px-5 py-6 text-[12.5px] text-navy-400">No updates yet.</p>;
  }

  const shown = limit ? updates.slice(0, limit) : updates;
  const hidden = updates.length - shown.length;

  return (
    <>
      <ol className="px-5 py-4">
        {shown.map((u, idx) => {
          // A status change is the most informative entry, so it carries the
          // status's own colour; anything else falls back to its type colour.
          const status = u.newStatus as CaseStatus | null;
          const badgeClass = status
            ? CASE_STATUS_BADGE[status]
            : TYPE_BADGE[u.type] ?? "bg-surface-muted text-navy-600";
          const badgeLabel = status ? CASE_STATUS_LABELS[status] : TYPE_LABEL[u.type] ?? u.type;
          const { date, time } = formatDateParts(u.createdAt);

          return (
            <li key={u.id} className="relative flex gap-3.5 pb-5 last:pb-0">
              <div className="relative flex flex-col items-center pt-1">
                <span
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ring-4 ${
                    idx === 0 ? "bg-accent ring-accent-50" : "bg-navy-300 ring-transparent"
                  }`}
                />
                {idx < shown.length - 1 && <span className="mt-1 w-px flex-1 bg-line-subtle" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] text-navy-500">
                      {date}, {time}
                    </p>
                    <p className="text-[11.5px] text-navy-400">
                      {u.user.displayName ?? u.user.prognosisUsername} · {ROLE_LABELS[u.user.role]}
                    </p>
                  </div>
                  <Badge className={badgeClass}>{badgeLabel}</Badge>
                </div>

                <p className="mt-1.5 text-[12.5px] font-semibold text-navy-900">
                  {TYPE_LABEL[u.type] ?? u.type}
                  {u.previousStatus && status && (
                    <span className="ml-1.5 font-normal text-navy-500">
                      {CASE_STATUS_LABELS[u.previousStatus as CaseStatus]} → {CASE_STATUS_LABELS[status]}
                    </span>
                  )}
                </p>
                {u.note && <p className="mt-0.5 text-[12.5px] leading-relaxed text-navy-600">{u.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {hidden > 0 && (
        <p className="border-t border-line-subtle px-5 py-3 text-center text-[12px] text-navy-500">
          {hidden} earlier {hidden === 1 ? "entry" : "entries"} — see the Provider Team tab for the full history.
        </p>
      )}
    </>
  );
}

import type { CaseStatus, CaseUpdate, User } from "@prisma/client";
import { CASE_STATUS_LABELS, formatDateTime } from "@/lib/domain";

type TimelineEntry = CaseUpdate & { user: User };

const TYPE_LABEL: Record<string, string> = {
  STATUS_CHANGE: "Status Update",
  NOTE: "Note",
  NOTIFICATION: "Member Notification",
  OWNER_CHANGE: "Ownership",
};

export function Timeline({ updates }: { updates: TimelineEntry[] }) {
  if (updates.length === 0) {
    return <p className="px-5 py-6 text-[12.5px] text-ink-400">No updates yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {updates.map((u, idx) => (
        <li key={u.id} className="relative flex gap-3 px-5 py-3.5">
          <div className="relative flex flex-col items-center">
            <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-brand" />
            {idx < updates.length - 1 && <span className="w-px flex-1 bg-ink-100" />}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-semibold text-ink-900">
                {TYPE_LABEL[u.type] ?? u.type}
                {u.newStatus && (
                  <span className="ml-1.5 font-normal text-ink-500">
                    {u.previousStatus ? `${CASE_STATUS_LABELS[u.previousStatus as CaseStatus]} → ` : ""}
                    {CASE_STATUS_LABELS[u.newStatus as CaseStatus]}
                  </span>
                )}
              </p>
              <span className="whitespace-nowrap text-[11px] text-ink-400">{formatDateTime(u.createdAt)}</span>
            </div>
            {u.note && <p className="mt-0.5 text-[12.5px] text-ink-600">{u.note}</p>}
            <p className="mt-0.5 text-[11px] text-ink-400">by {u.user.displayName ?? u.user.prognosisUsername}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

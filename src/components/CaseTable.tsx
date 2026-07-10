import Link from "next/link";
import type { CaseStatus, NegotiationCase, Role, ServiceType, Urgency, User } from "@prisma/client";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  URGENCY_BADGE,
  URGENCY_LABELS,
  formatCurrency,
  formatDateTime,
  formatDuration,
  amountDifference,
} from "@/lib/domain";
import { claimCase } from "@/app/actions/case-actions";

export type CaseRow = NegotiationCase & {
  loggedBy: User;
  owner: User | null;
};

export function CaseTable({
  cases,
  showClaim = false,
  viewerRole,
}: {
  cases: CaseRow[];
  showClaim?: boolean;
  viewerRole?: Role;
}) {
  const isProviderTeamViewer = viewerRole === "PROVIDER_TEAM" || viewerRole === "ADMIN";

  if (cases.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-[13px] text-ink-400">
        No negotiation cases match this view.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-[12.5px]">
        <thead className="border-b border-ink-100 bg-ink-100/50 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <tr>
            <th className="px-4 py-3">Time Logged</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Enrollee</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3 text-right">Current Tariff</th>
            <th className="px-4 py-3 text-right">Requested Amount</th>
            <th className="px-4 py-3">Urgency</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Time Pending</th>
            <th className="px-4 py-3">Handled By</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cases.map((c) => {
            const pendingMs = (c.completedAt ?? new Date()).getTime() - c.loggedAt.getTime();
            const diff = amountDifference(c.currentTariff.toString(), c.providerRequestedAmount.toString());
            return (
              <tr key={c.id} className="hover:bg-ink-100/40">
                <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDateTime(c.loggedAt)}</td>
                <td className="px-4 py-3 text-ink-600">{c.loggedBy.displayName ?? c.loggedBy.prognosisUsername}</td>
                <td className="px-4 py-3 font-semibold text-ink-900">{c.providerName}</td>
                <td className="px-4 py-3 text-ink-700">{c.enrolleeName}</td>
                <td className="px-4 py-3 text-ink-700">{SERVICE_TYPE_LABELS[c.serviceType as ServiceType]}</td>
                <td className="px-4 py-3 text-right text-ink-700">{formatCurrency(c.currentTariff.toString())}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink-900">
                  {formatCurrency(c.providerRequestedAmount.toString())}
                  <span className={`ml-1.5 text-[10.5px] ${diff > 0 ? "text-brand-600" : "text-ink-400"}`}>
                    ({diff > 0 ? "+" : ""}{formatCurrency(diff)})
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge className={URGENCY_BADGE[c.urgency as Urgency]}>{URGENCY_LABELS[c.urgency as Urgency]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge className={CASE_STATUS_BADGE[c.status as CaseStatus]}>{CASE_STATUS_LABELS[c.status as CaseStatus]}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDuration(pendingMs)}</td>
                <td className="px-4 py-3 text-ink-600">{c.owner?.displayName ?? c.owner?.prognosisUsername ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {showClaim && !c.owner && (
                      <form action={claimCase}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <SubmitButton
                          variant="danger"
                          className="px-2.5 py-1.5 text-[11.5px]"
                          pendingLabel="Claiming…"
                        >
                          Claim
                        </SubmitButton>
                      </form>
                    )}
                    <Link
                      href={isProviderTeamViewer ? `/negotiations/${c.id}?tab=provider-team` : `/negotiations/${c.id}`}
                      className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-100"
                    >
                      {isProviderTeamViewer ? "Treat" : "View"}
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

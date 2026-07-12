import Link from "next/link";
import type { NegotiationCase, RequestType, Role, ServiceType, User } from "@prisma/client";
import { Badge } from "@/components/ui";
import {
  REQUEST_TYPE_BADGE,
  REQUEST_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  formatCurrency,
  formatDateTime,
  formatDuration,
  amountDifference,
} from "@/lib/domain";

export type CaseRow = NegotiationCase & {
  loggedBy: User;
  owner: User | null;
};

export function CaseTable({
  cases,
  viewerRole,
}: {
  cases: CaseRow[];
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
            <th className="px-4 py-3" />
            <th className="px-4 py-3">Time Logged</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Enrollee</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">Request Type</th>
            <th className="px-4 py-3 text-right">Current Tariff</th>
            <th className="px-4 py-3 text-right">Requested Amount</th>
            <th className="px-4 py-3 text-right">Updated Amount</th>
            <th className="px-4 py-3">Time Pending</th>
            <th className="px-4 py-3">Handled By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cases.map((c) => {
            const pendingMs = (c.completedAt ?? new Date()).getTime() - c.loggedAt.getTime();
            const isAgreed = c.status === "COMPLETED" && c.finalAgreedAmount !== null;
            const diff = amountDifference(c.currentTariff.toString(), c.providerRequestedAmount.toString());
            // Completed cases have no further status transitions (STATUS_TRANSITIONS.COMPLETED is
            // empty) — there's nothing left to treat, so link straight to the read-only view even
            // for Provider Team/Admin. Declined cases can still be reopened, so they keep "Treat".
            const canTreat = isProviderTeamViewer && c.status !== "COMPLETED";
            return (
              <tr key={c.id} className="hover:bg-ink-100/40">
                <td className="px-4 py-3">
                  <Link
                    href={canTreat ? `/negotiations/${c.id}?tab=provider-team` : `/negotiations/${c.id}`}
                    className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-100"
                  >
                    {canTreat ? "Treat" : "View"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDateTime(c.loggedAt)}</td>
                <td className="px-4 py-3 text-ink-600">{c.loggedBy.displayName ?? c.loggedBy.prognosisUsername}</td>
                <td className="px-4 py-3 font-semibold text-ink-900">{c.providerName}</td>
                <td className="px-4 py-3 text-ink-700">{c.enrolleeName}</td>
                <td className="px-4 py-3 text-ink-700">{SERVICE_TYPE_LABELS[c.serviceType as ServiceType]}</td>
                <td className="px-4 py-3">
                  <Badge className={REQUEST_TYPE_BADGE[c.requestType as RequestType]}>
                    {REQUEST_TYPE_LABELS[c.requestType as RequestType]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-ink-700">{formatCurrency(c.currentTariff.toString())}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink-900">
                  {formatCurrency(c.providerRequestedAmount.toString())}
                  <span className={`ml-1.5 text-[10.5px] ${diff > 0 ? "text-brand-600" : "text-ink-400"}`}>
                    ({diff > 0 ? "+" : ""}{formatCurrency(diff)})
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-ink-900">
                  {isAgreed ? formatCurrency(c.finalAgreedAmount!.toString()) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDuration(pendingMs)}</td>
                <td className="px-4 py-3 text-ink-600">{c.owner?.displayName ?? c.owner?.prognosisUsername ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

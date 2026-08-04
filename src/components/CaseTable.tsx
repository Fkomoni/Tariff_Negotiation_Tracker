import Link from "next/link";
import type { NegotiationCase, RequestType, Role, ServiceType, User } from "@prisma/client";
import { Badge } from "@/components/ui";
import {
  PM_CATEGORY_SHORT_LABELS,
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

/**
 * One submitted negotiation request, with every service the current view
 * contains for it.
 *
 * Each service is its own NegotiationCase row in the database (siblings share a
 * sessionGroupId), which is what made a 5-service request fill five near
 * identical lines of the queue. Collapsing to one line per request is purely a
 * presentation change — the underlying cases are untouched, and opening the
 * request still shows and treats each service individually.
 */
interface RequestGroup {
  root: string;
  /** Oldest service in the request — carries the fields that are identical
   * across the group (provider, enrollee, agent, logged time). */
  primary: CaseRow;
  /** Services belonging to this request *that the current filter includes*. */
  members: CaseRow[];
  /** Services in the request across every status, so the row can say "2 of 3"
   * when a filter or an already-closed sibling hides some. */
  totalInRequest: number;
}

function groupByRequest(cases: CaseRow[], groupSizes?: Record<string, number>): RequestGroup[] {
  const byRoot = new Map<string, CaseRow[]>();
  for (const c of cases) {
    // A case is its own group root unless it points at one, matching the
    // convention in negotiations/[id]/page.tsx.
    const root = c.sessionGroupId ?? c.id;
    const existing = byRoot.get(root);
    if (existing) existing.push(c);
    else byRoot.set(root, [c]);
  }

  // Map iteration is insertion-ordered, so groups come out in the order the
  // page's sort produced — the chosen sort still drives the list.
  return Array.from(byRoot.entries()).map(([root, members]) => {
    const sorted = [...members].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
    return {
      root,
      primary: sorted[0],
      members: sorted,
      // Never let the total read lower than what's on screen, even if the
      // group-size query and this list disagree.
      totalInRequest: Math.max(groupSizes?.[root] ?? members.length, members.length),
    };
  });
}

/** Sums a Decimal column across a request. Display-only, so plain number
 * arithmetic is fine at naira magnitudes; nothing is persisted from this. */
function sumOf(members: CaseRow[], pick: (c: CaseRow) => { toString(): string } | null): number {
  return members.reduce((total, c) => {
    const value = pick(c);
    return total + (value ? Number(value.toString()) : 0);
  }, 0);
}

export function CaseTable({
  cases,
  viewerRole,
  groupSizes,
}: {
  cases: CaseRow[];
  viewerRole?: Role;
  /** Group root id → how many services were logged in that visit, counted
   * across every status so the count stays accurate even when the current
   * filter hides some of the sibling services. */
  groupSizes?: Record<string, number>;
}) {
  const isProviderTeamViewer = viewerRole === "PROVIDER_TEAM" || viewerRole === "ADMIN";

  if (cases.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-[13px] text-navy-400">
        No negotiation cases match this view.
      </div>
    );
  }

  const groups = groupByRequest(cases, groupSizes);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-[12.5px]">
        <thead className="border-b border-line-subtle bg-surface-muted text-[11px] font-semibold uppercase tracking-wide text-navy-500">
          <tr>
            <th className="px-4 py-3" />
            <th className="px-4 py-3">Time Logged</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Enrollee</th>
            <th className="px-4 py-3">Service Type</th>
            <th className="px-4 py-3">Services</th>
            <th className="px-4 py-3">Request Type</th>
            <th className="px-4 py-3 text-right">Current Tariff</th>
            <th className="px-4 py-3 text-right">Requested Amount</th>
            <th className="px-4 py-3 text-right">Updated Amount</th>
            <th className="px-4 py-3">Time Pending</th>
            <th className="px-4 py-3">Handled By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {groups.map(({ root, primary, members, totalInRequest }) => {
            const isMulti = totalInRequest > 1;
            const isPm = primary.caseType === "PROVIDER_MANAGEMENT";

            // Longest-pending service drives the clock: it's the one at risk,
            // and the request is only really done when it is.
            const pendingMs = Math.max(
              ...members.map((c) => (c.completedAt ?? new Date()).getTime() - c.loggedAt.getTime())
            );

            // Amounts are the request total, so the Provider Team sees what the
            // whole visit is worth rather than one line of it.
            const currentTotal = sumOf(members, (c) => c.currentTariff);
            const requestedTotal = sumOf(members, (c) => c.providerRequestedAmount);
            const diff = amountDifference(String(currentTotal), String(requestedTotal));
            const agreedMembers = members.filter((c) => c.finalAgreedAmount !== null);
            const agreedTotal = sumOf(agreedMembers, (c) => c.finalAgreedAmount);

            const serviceTypes = Array.from(
              new Set(members.map((c) => c.serviceType).filter((t): t is ServiceType => Boolean(t)))
            );
            const requestTypes = Array.from(new Set(members.map((c) => c.requestType as RequestType)));
            const owners = Array.from(
              new Set(members.map((c) => c.owner?.displayName ?? c.owner?.prognosisUsername).filter(Boolean))
            );
            const itemList = members.map((c) => c.requestedItem).join(", ");

            // Completed cases have no further status transitions
            // (STATUS_TRANSITIONS.COMPLETED is empty), so there's nothing to
            // treat. A request is only fully done when every service is, and
            // the link lands on a service that still needs work.
            const treatTarget = members.find((c) => c.status !== "COMPLETED");
            const canTreat = isProviderTeamViewer && treatTarget !== undefined;

            return (
              <tr key={root} className="align-top hover:bg-surface-muted/60">
                <td className="px-4 py-3">
                  <Link
                    href={canTreat ? `/negotiations/${treatTarget.id}?tab=provider-team` : `/negotiations/${primary.id}`}
                    className="rounded-md border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-700 hover:bg-surface-muted"
                  >
                    {canTreat ? "Treat" : "View"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-navy-500">{formatDateTime(primary.loggedAt)}</td>
                <td className="px-4 py-3 text-navy-600">
                  {primary.loggedBy.displayName ?? primary.loggedBy.prognosisUsername}
                </td>
                <td className="px-4 py-3 font-semibold text-navy-900">{primary.providerName}</td>
                <td className="px-4 py-3 text-navy-700">{primary.enrolleeName}</td>
                <td className="px-4 py-3 text-navy-700">
                  {isPm
                    ? "—"
                    : serviceTypes.length === 0
                      ? "—"
                      : serviceTypes.length === 1
                        ? SERVICE_TYPE_LABELS[serviceTypes[0]]
                        : "Multiple"}
                </td>

                {/* One line per request. A multi-service request leads with the
                    count rather than every item name — that's what let five
                    services swamp the queue. The names are still here, muted
                    and clamped to the row, with the full list on hover and on
                    the case itself. */}
                <td className="max-w-[240px] px-4 py-3">
                  {isMulti ? (
                    <>
                      <Badge className="bg-accent-50 text-accent-600">
                        {members.length === totalInRequest
                          ? `${totalInRequest} services`
                          : `${members.length} of ${totalInRequest} services`}
                      </Badge>
                      <span className="mt-1 block truncate text-[11.5px] text-navy-500" title={itemList}>
                        {itemList}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium text-navy-800">{primary.requestedItem}</span>
                  )}
                </td>

                <td className="px-4 py-3">
                  {isPm ? (
                    <div className="flex flex-wrap gap-1">
                      {primary.pmCategories.map((cat) => (
                        <Badge key={cat} className="bg-sky-100 text-sky-800">
                          {PM_CATEGORY_SHORT_LABELS[cat]}
                        </Badge>
                      ))}
                    </div>
                  ) : requestTypes.length === 1 ? (
                    <Badge className={REQUEST_TYPE_BADGE[requestTypes[0]]}>{REQUEST_TYPE_LABELS[requestTypes[0]]}</Badge>
                  ) : (
                    <Badge className="bg-surface-muted text-navy-600">Mixed</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-navy-700">
                  {isPm ? "—" : formatCurrency(String(currentTotal))}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-navy-900">
                  {isPm ? (
                    "—"
                  ) : (
                    <>
                      {formatCurrency(String(requestedTotal))}
                      <span className={`ml-1.5 text-[10.5px] ${diff > 0 ? "text-brand-600" : "text-navy-400"}`}>
                        ({diff > 0 ? "+" : ""}
                        {formatCurrency(diff)})
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-navy-900">
                  {isPm || agreedMembers.length === 0 ? (
                    "—"
                  ) : (
                    <>
                      {formatCurrency(String(agreedTotal))}
                      {agreedMembers.length < members.length && (
                        <span className="ml-1 text-[10.5px] font-normal text-navy-400">
                          ({agreedMembers.length}/{members.length})
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-navy-500">{formatDuration(pendingMs)}</td>
                <td className="px-4 py-3 text-navy-600">
                  {owners.length === 0 ? "—" : owners.length === 1 ? owners[0] : "Multiple"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

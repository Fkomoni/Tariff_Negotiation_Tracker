import Link from "next/link";
import type { NegotiationCase, RequestType, Role, ServiceType, Urgency, User } from "@prisma/client";
import { Badge } from "@/components/ui";
import { ClockIcon, SortArrows } from "@/components/icons";
import { groupCasesByRequest } from "@/lib/case-groups";
import {
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  PM_CATEGORY_SHORT_LABELS,
  REQUEST_TYPE_BADGE,
  REQUEST_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  URGENCY_BADGE,
  URGENCY_LABELS,
  formatCurrency,
  formatDateParts,
  formatDuration,
  amountDifference,
} from "@/lib/domain";

export type CaseRow = NegotiationCase & {
  loggedBy: User;
  owner: User | null;
};

/** Sums a Decimal column across a request. Display-only, so plain number
 * arithmetic is fine at naira magnitudes; nothing is persisted from this. */
function sumOf(members: CaseRow[], pick: (c: CaseRow) => { toString(): string } | null): number {
  return members.reduce((total, c) => {
    const value = pick(c);
    return total + (value ? Number(value.toString()) : 0);
  }, 0);
}

/**
 * A column header that links to the sort it represents.
 *
 * Only rendered as a link when the page actually supports sorting by that
 * column - an arrow on a header that does nothing is worse than no arrow.
 */
function Th({
  label,
  sort,
  currentSort,
  sortHref,
  align = "left",
  direction,
}: {
  label: string;
  sort?: string;
  currentSort?: string;
  sortHref?: (key: string) => string;
  align?: "left" | "right";
  /** Which arrow to fill when this column is the active sort. */
  direction?: "asc" | "desc";
}) {
  const alignClass = align === "right" ? "justify-end text-right" : "";
  if (!sort || !sortHref) {
    return <th className={`px-3 py-3 ${align === "right" ? "text-right" : ""}`}>{label}</th>;
  }
  const active = currentSort === sort;
  return (
    <th className={`px-3 py-3 ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={sortHref(sort)}
        className={`inline-flex items-center gap-1.5 ${alignClass} transition-colors hover:text-navy-900 ${
          active ? "text-navy-900" : ""
        }`}
      >
        {label}
        <SortArrows className="h-3 w-2 flex-shrink-0" active={active ? (direction ?? "desc") : null} />
      </Link>
    </th>
  );
}

export function CaseTable({
  cases,
  viewerRole,
  groupSizes,
  variant = "open",
  currentSort,
  sortHref,
}: {
  cases: CaseRow[];
  viewerRole?: Role;
  /** Group root id → how many services were logged in that visit, counted
   * across every status so the count stays accurate even when the current
   * filter hides some of the sibling services. */
  groupSizes?: Record<string, number>;
  /** "open" follows the queue's column set; "completed" swaps Urgency for the
   * agreed amount and who handled it, which is what that page is read for. */
  variant?: "open" | "completed";
  currentSort?: string;
  sortHref?: (key: string) => string;
}) {
  const isProviderTeamViewer = viewerRole === "PROVIDER_TEAM" || viewerRole === "ADMIN";
  const isCompletedView = variant === "completed";

  if (cases.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-[13px] text-navy-400">
        No negotiation cases match this view.
      </div>
    );
  }

  const groups = groupCasesByRequest(cases);
  const th = { currentSort, sortHref };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1230px] text-left text-[12.5px]">
        <thead className="border-b border-line-subtle bg-surface-muted text-[10.5px] font-semibold uppercase tracking-wide text-navy-500">
          <tr>
            <th className="px-3 py-3" />
            <Th label="Time Logged" sort="newest" direction="desc" {...th} />
            <Th label="Agent" sort="agent" direction="asc" {...th} />
            <Th label="Provider" sort="provider" direction="asc" {...th} />
            <Th label="Enrollee" sort="enrollee" direction="asc" {...th} />
            <Th label="Service Type" sort="serviceType" direction="asc" {...th} />
            <Th label="Services" {...th} />
            <Th label="Request Type" sort="requestType" direction="asc" {...th} />
            <Th label="Current Tariff" align="right" {...th} />
            <Th label="Requested Amount" sort="amount" direction="desc" align="right" {...th} />
            <Th label="Amount Diff." align="right" {...th} />
            {isCompletedView && <Th label="Updated Amount" align="right" {...th} />}
            <Th label="Time Pending" sort="pending" direction="asc" {...th} />
            {!isCompletedView && <Th label="Urgency" sort="urgent" direction="desc" {...th} />}
            <Th label="Status" sort="status" direction="asc" {...th} />
            {isCompletedView && <Th label="Handled By" {...th} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {groups.map((members) => {
            const sorted = [...members].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
            const primary = sorted[0];
            const root = primary.sessionGroupId ?? primary.id;
            // Never let the total read lower than what's on screen, even if the
            // group-size query and this list disagree.
            const totalInRequest = Math.max(groupSizes?.[root] ?? sorted.length, sorted.length);
            const isMulti = totalInRequest > 1;
            const isPm = primary.caseType === "PROVIDER_MANAGEMENT";

            // Longest-pending service drives the clock: it's the one at risk,
            // and the request is only really done when it is.
            const pendingMs = Math.max(
              ...sorted.map((c) => (c.completedAt ?? new Date()).getTime() - c.loggedAt.getTime())
            );

            // Amounts are the request total, so the Provider Team sees what the
            // whole visit is worth rather than one line of it.
            const currentTotal = sumOf(sorted, (c) => c.currentTariff);
            const requestedTotal = sumOf(sorted, (c) => c.providerRequestedAmount);
            const diff = amountDifference(String(currentTotal), String(requestedTotal));
            const diffPct = currentTotal > 0 ? (diff / currentTotal) * 100 : null;
            const agreedMembers = sorted.filter((c) => c.finalAgreedAmount !== null);
            const agreedTotal = sumOf(agreedMembers, (c) => c.finalAgreedAmount);

            const serviceTypes = Array.from(
              new Set(sorted.map((c) => c.serviceType).filter((t): t is ServiceType => Boolean(t)))
            );
            const requestTypes = Array.from(new Set(sorted.map((c) => c.requestType as RequestType)));
            const statuses = Array.from(new Set(sorted.map((c) => c.status)));
            const owners = Array.from(
              new Set(sorted.map((c) => c.owner?.displayName ?? c.owner?.prognosisUsername).filter(Boolean))
            );
            const itemList = sorted.map((c) => c.requestedItem).join(", ");
            // Highest urgency in the request - a routine line shouldn't mask an
            // emergency one sharing the same submission.
            const urgencyRank: Record<Urgency, number> = { ROUTINE: 0, URGENT: 1, EMERGENCY: 2 };
            const topUrgency = sorted.reduce<Urgency>(
              (worst, c) => (urgencyRank[c.urgency] > urgencyRank[worst] ? c.urgency : worst),
              "ROUTINE"
            );

            // Completed cases have no further status transitions
            // (STATUS_TRANSITIONS.COMPLETED is empty), so there's nothing to
            // treat. The link lands on a service that still needs work.
            const treatTarget = sorted.find((c) => c.status !== "COMPLETED");
            const canTreat = isProviderTeamViewer && treatTarget !== undefined;

            return (
              <tr key={root} className="align-top transition-colors hover:bg-surface-muted/60">
                <td className="px-3 py-4">
                  <Link
                    href={canTreat ? `/negotiations/${treatTarget.id}?tab=provider-team` : `/negotiations/${primary.id}`}
                    className={`rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold ${
                      canTreat
                        ? "border border-accent/40 bg-accent-50 text-accent-600 hover:bg-accent-100"
                        : "border border-line text-navy-700 hover:bg-surface-muted"
                    }`}
                  >
                    {canTreat ? "Treat" : "View"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-navy-500">
                  <span className="block text-navy-700">{formatDateParts(primary.loggedAt).date}</span>
                  <span className="block text-[11px] text-navy-400">{formatDateParts(primary.loggedAt).time}</span>
                </td>
                <td className="px-3 py-4 text-navy-600">
                  {primary.loggedBy.displayName ?? primary.loggedBy.prognosisUsername}
                </td>
                <td className="max-w-[140px] px-3 py-4 font-semibold text-navy-900">{primary.providerName}</td>
                <td className="max-w-[130px] px-3 py-4 text-navy-700">{primary.enrolleeName}</td>
                <td className="px-3 py-4 text-navy-700">
                  {isPm
                    ? "-"
                    : serviceTypes.length === 0
                      ? "-"
                      : serviceTypes.length === 1
                        ? SERVICE_TYPE_LABELS[serviceTypes[0]]
                        : "Multiple"}
                </td>

                {/* One line per request. A multi-service request leads with the
                    count rather than every item name - that's what let five
                    services swamp the queue. The names are still here, muted
                    and clamped to the row, with the full list on hover and on
                    the case itself. */}
                <td className="max-w-[190px] px-3 py-4">
                  {isMulti ? (
                    <>
                      <Badge className="bg-accent-50 text-accent-600">
                        {sorted.length === totalInRequest
                          ? `${totalInRequest} services`
                          : `${sorted.length} of ${totalInRequest} services`}
                      </Badge>
                      <span className="mt-1 block truncate text-[11.5px] text-navy-500" title={itemList}>
                        {itemList}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium text-navy-800">{primary.requestedItem}</span>
                  )}
                </td>

                <td className="max-w-[118px] px-3 py-4">
                  {isPm ? (
                    <div className="flex flex-wrap gap-1">
                      {primary.pmCategories.map((cat) => (
                        <Badge key={cat} className="bg-sky-100 text-sky-800">
                          {PM_CATEGORY_SHORT_LABELS[cat]}
                        </Badge>
                      ))}
                    </div>
                  ) : requestTypes.length === 1 ? (
                    <Badge className={`badge-wrap ${REQUEST_TYPE_BADGE[requestTypes[0]]}`}>
                      {REQUEST_TYPE_LABELS[requestTypes[0]]}
                    </Badge>
                  ) : (
                    <Badge className="bg-surface-muted text-navy-600">Mixed</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-right text-navy-700">
                  {isPm ? "-" : formatCurrency(String(currentTotal))}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-right font-semibold text-navy-900">
                  {isPm ? "-" : formatCurrency(String(requestedTotal))}
                </td>

                {/* Its own column rather than a suffix on the requested amount:
                    the gap is what the Provider Team is deciding on, and the
                    percentage is what makes a ₦17,000 ask on a ₦23,000 tariff
                    read differently from the same ₦17,000 on ₦120,000. */}
                <td className="whitespace-nowrap px-3 py-4 text-right">
                  {isPm ? (
                    <span className="text-navy-400">-</span>
                  ) : (
                    <>
                      <span className={`font-semibold ${diff > 0 ? "text-brand-600" : diff < 0 ? "text-emerald-700" : "text-navy-500"}`}>
                        {diff > 0 ? "+" : ""}
                        {formatCurrency(diff)}
                      </span>
                      {diffPct !== null && (
                        <span className="mt-0.5 block text-[10.5px] text-navy-400">
                          ({diffPct > 0 ? "+" : ""}
                          {diffPct.toFixed(2)}%)
                        </span>
                      )}
                    </>
                  )}
                </td>

                {isCompletedView && (
                  <td className="whitespace-nowrap px-3 py-4 text-right font-semibold text-navy-900">
                    {isPm || agreedMembers.length === 0 ? (
                      "-"
                    ) : (
                      <>
                        {formatCurrency(String(agreedTotal))}
                        {agreedMembers.length < sorted.length && (
                          <span className="ml-1 text-[10.5px] font-normal text-navy-400">
                            ({agreedMembers.length}/{sorted.length})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                )}

                <td className="whitespace-nowrap px-3 py-4">
                  <span className="inline-flex items-center gap-1.5 text-navy-600">
                    <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                    {formatDuration(pendingMs)}
                  </span>
                </td>

                {!isCompletedView && (
                  <td className="px-3 py-4">
                    <Badge className={URGENCY_BADGE[topUrgency]}>{URGENCY_LABELS[topUrgency]}</Badge>
                  </td>
                )}

                <td className="px-3 py-4">
                  {statuses.length === 1 ? (
                    <Badge className={CASE_STATUS_BADGE[statuses[0]]}>{CASE_STATUS_LABELS[statuses[0]]}</Badge>
                  ) : (
                    // Services in one request can be at different stages, so a
                    // single badge would misreport the request's state.
                    <span title={statuses.map((s) => CASE_STATUS_LABELS[s]).join(", ")}>
                      <Badge className="bg-surface-muted text-navy-600">{statuses.length} stages</Badge>
                    </span>
                  )}
                </td>

                {isCompletedView && (
                  <td className="px-3 py-4 text-navy-600">
                    {owners.length === 0 ? "-" : owners.length === 1 ? owners[0] : "Multiple"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import {
  QueueIcon,
  SortIcon,
  BoltIcon,
  BuildingIcon,
  MinusCircleIcon,
  ClockIcon,
  LogIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { CaseTable } from "@/components/CaseTable";
import { getCaseGroupSizes, groupCasesByRequest } from "@/lib/case-groups";
import { OPEN_STATUSES, CASE_STATUS_LABELS, URGENCY_LABELS } from "@/lib/domain";
import type { Prisma, Urgency } from "@prisma/client";

type SortOption = {
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  orderBy: Prisma.NegotiationCaseOrderByWithRelationInput[];
};

const SORT_OPTIONS: Record<string, SortOption> = {
  newest: { label: "Newest First", icon: SortIcon, orderBy: [{ loggedAt: "desc" }] },
  oldest: { label: "Oldest First", icon: SortIcon, orderBy: [{ loggedAt: "asc" }] },
  urgent: { label: "Urgent First", icon: BoltIcon, orderBy: [{ urgency: "desc" }, { loggedAt: "asc" }] },
  provider: { label: "Provider", icon: BuildingIcon, orderBy: [{ providerName: "asc" }] },
  status: { label: "Status", icon: MinusCircleIcon, orderBy: [{ status: "asc" }] },
  amount: { label: "Highest Amount Difference", icon: SortIcon, orderBy: [{ providerRequestedAmount: "desc" }] },
  pending: { label: "Longest Pending", icon: ClockIcon, orderBy: [{ loggedAt: "asc" }] },
  // Reachable from the sortable column headers rather than the chip row above,
  // which is why these carry no icon of their own.
  agent: { label: "Agent", icon: SortIcon, orderBy: [{ loggedBy: { displayName: "asc" } }] },
  enrollee: { label: "Enrollee", icon: SortIcon, orderBy: [{ enrolleeName: "asc" }] },
  serviceType: { label: "Service Type", icon: SortIcon, orderBy: [{ serviceType: "asc" }] },
  requestType: { label: "Request Type", icon: SortIcon, orderBy: [{ requestType: "asc" }] },
};

/** Only these appear as chips; the rest are header-only sorts. */
const CHIP_SORTS = ["newest", "oldest", "urgent", "provider", "status", "amount", "pending"] as const;

const PER_PAGE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PER_PAGE = 10;

export default async function OpenNegotiationsPage(props: {
  searchParams: Promise<{ sort?: string; status?: string; urgency?: string; page?: string; perPage?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const sortKey = searchParams.sort && SORT_OPTIONS[searchParams.sort] ? searchParams.sort : "newest";
  const statusFilter =
    searchParams.status && OPEN_STATUSES.includes(searchParams.status as never) ? searchParams.status : undefined;
  // "PRIORITY" covers Urgent + Emergency together. The dashboard's Urgent
  // Unresolved card counts both, so without this its link landed on a list
  // showing fewer cases than the number that was clicked.
  const urgencyParam = searchParams.urgency;
  const urgencyFilter: Prisma.NegotiationCaseWhereInput["urgency"] =
    urgencyParam === "PRIORITY"
      ? { in: ["URGENT", "EMERGENCY"] }
      : urgencyParam && Object.keys(URGENCY_LABELS).includes(urgencyParam)
        ? (urgencyParam as Urgency)
        : undefined;
  const perPage = PER_PAGE_OPTIONS.includes(Number(searchParams.perPage) as never)
    ? Number(searchParams.perPage)
    : DEFAULT_PER_PAGE;

  const cases = await prisma.negotiationCase.findMany({
    where: {
      status: statusFilter ? (statusFilter as never) : { in: OPEN_STATUSES },
      urgency: urgencyFilter,
    },
    orderBy: SORT_OPTIONS[sortKey].orderBy,
    include: { loggedBy: true, owner: true },
  });

  const groupSizes = await getCaseGroupSizes(cases);

  // Paged by request, not by case row: the table renders one row per request,
  // so slicing cases would split a multi-service request across two pages.
  // Grouping in memory (rather than a DISTINCT-ON query) keeps this simple and
  // is fine at the volumes here - the page already loaded every matching case
  // before pagination existed.
  const groups = groupCasesByRequest(cases);
  const totalRequests = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalRequests / perPage));
  // Clamped so a stale ?page= from a since-shrunk list can't render an empty
  // table with no way back.
  const page = Math.min(Math.max(Number(searchParams.page) || 1, 1), totalPages);
  const pageGroups = groups.slice((page - 1) * perPage, page * perPage);
  const pageCases = pageGroups.flat();

  const firstShown = totalRequests === 0 ? 0 : (page - 1) * perPage + 1;
  const lastShown = (page - 1) * perPage + pageGroups.length;

  function buildHref(overrides: {
    sort?: string;
    status?: string;
    urgency?: string;
    page?: number;
    perPage?: number;
  }) {
    const params = new URLSearchParams();
    params.set("sort", overrides.sort !== undefined ? overrides.sort : sortKey);
    const status = overrides.status !== undefined ? overrides.status : statusFilter ?? "";
    const urgency = overrides.urgency !== undefined ? overrides.urgency : urgencyParam ?? "";
    if (status) params.set("status", status);
    if (urgency) params.set("urgency", urgency);
    const nextPerPage = overrides.perPage ?? perPage;
    if (nextPerPage !== DEFAULT_PER_PAGE) params.set("perPage", String(nextPerPage));
    // Any change to sort/filter/page-size invalidates the current page number,
    // so callers that don't pass one land back on page 1.
    const nextPage = overrides.page ?? 1;
    if (nextPage > 1) params.set("page", String(nextPage));
    return `/negotiations/queue?${params.toString()}`;
  }

  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
      active ? "bg-brand text-white" : "bg-surface-muted text-navy-600 hover:bg-line-subtle"
    }`;

  return (
    <>
      <Header
        title="Open Negotiations"
        subtitle={
          ["PROVIDER_TEAM", "ADMIN"].includes(session.user.role)
            ? "Provider Team Queue"
            : "Track the status of logged requests"
        }
        icon={<QueueIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
        alertCount={totalRequests}
      />

      <div className="flex flex-1 flex-col gap-5 px-8 py-7">
        <Card className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent">
                  <QueueIcon className="h-[19px] w-[19px]" />
                </span>
                <span>
                  <span className="block text-[19px] font-bold leading-tight text-navy-900">{totalRequests}</span>
                  <span className="block text-[11.5px] text-navy-500">
                    Open Request{totalRequests === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-muted text-navy-500">
                  <LogIcon className="h-[19px] w-[19px]" />
                </span>
                <span>
                  <span className="block text-[19px] font-bold leading-tight text-navy-900">{cases.length}</span>
                  <span className="block text-[11.5px] text-navy-500">Service{cases.length === 1 ? "" : "s"}</span>
                </span>
              </div>
            </div>

            <div className="flex max-w-[640px] flex-wrap justify-end gap-2">
              {CHIP_SORTS.map((key) => {
                const opt = SORT_OPTIONS[key];
                const Icon = opt.icon;
                const active = sortKey === key;
                return (
                  <Link
                    key={key}
                    href={buildHref({ sort: key })}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold transition-colors ${
                      active ? "bg-navy-900 text-white" : "bg-white text-navy-600 ring-1 ring-line hover:bg-surface-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    {opt.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-line-subtle pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 w-[58px] text-[10.5px] font-bold uppercase tracking-wide text-navy-400">Status</span>
              <Link href={buildHref({ status: "" })} className={pill(!statusFilter)}>
                All Open
              </Link>
              {OPEN_STATUSES.map((status) => (
                <Link key={status} href={buildHref({ status })} className={pill(statusFilter === status)}>
                  {CASE_STATUS_LABELS[status]}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 w-[58px] text-[10.5px] font-bold uppercase tracking-wide text-navy-400">Urgency</span>
              <Link href={buildHref({ urgency: "" })} className={pill(!urgencyParam)}>
                All
              </Link>
              <Link href={buildHref({ urgency: "PRIORITY" })} className={pill(urgencyParam === "PRIORITY")}>
                Urgent + Emergency
              </Link>
              {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                <Link key={value} href={buildHref({ urgency: value })} className={pill(urgencyParam === value)}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CaseTable
            cases={pageCases}
            viewerRole={session.user.role}
            groupSizes={groupSizes}
            variant="open"
            currentSort={sortKey}
            sortHref={(key) => buildHref({ sort: key })}
          />

          {totalRequests > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-subtle px-5 py-3.5">
              <p className="text-[12px] text-navy-500">
                Showing {firstShown} to {lastShown} of {totalRequests} request{totalRequests === 1 ? "" : "s"}
              </p>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Link
                    href={buildHref({ page: page - 1, perPage })}
                    aria-disabled={page === 1}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line text-navy-500 ${
                      page === 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-muted hover:text-navy-900"
                    }`}
                  >
                    <ChevronRightIcon className="h-4 w-4 rotate-180" />
                  </Link>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <Link
                      key={n}
                      href={buildHref({ page: n, perPage })}
                      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12px] font-semibold ${
                        n === page
                          ? "border border-accent bg-accent-50 text-accent-600"
                          : "border border-line text-navy-600 hover:bg-surface-muted"
                      }`}
                    >
                      {n}
                    </Link>
                  ))}
                  <Link
                    href={buildHref({ page: page + 1, perPage })}
                    aria-disabled={page === totalPages}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line text-navy-500 ${
                      page === totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-muted hover:text-navy-900"
                    }`}
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                </div>

                <div className="flex items-center gap-1">
                  {PER_PAGE_OPTIONS.map((n) => (
                    <Link
                      key={n}
                      href={buildHref({ perPage: n })}
                      className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${
                        n === perPage
                          ? "bg-navy-900 text-white"
                          : "border border-line text-navy-600 hover:bg-surface-muted"
                      }`}
                    >
                      {n} / page
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

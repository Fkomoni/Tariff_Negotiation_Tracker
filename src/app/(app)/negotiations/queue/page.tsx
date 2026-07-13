import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import { QueueIcon } from "@/components/icons";
import { CaseTable } from "@/components/CaseTable";
import { OPEN_STATUSES, CASE_STATUS_LABELS, URGENCY_LABELS } from "@/lib/domain";
import type { Prisma, Urgency } from "@prisma/client";

const SORT_OPTIONS: Record<string, { label: string; orderBy: Prisma.NegotiationCaseOrderByWithRelationInput[] }> = {
  newest: { label: "Newest First", orderBy: [{ loggedAt: "desc" }] },
  oldest: { label: "Oldest First", orderBy: [{ loggedAt: "asc" }] },
  urgent: { label: "Urgent First", orderBy: [{ urgency: "desc" }, { loggedAt: "asc" }] },
  provider: { label: "Provider", orderBy: [{ providerName: "asc" }] },
  status: { label: "Status", orderBy: [{ status: "asc" }] },
  amount: { label: "Highest Amount Difference", orderBy: [{ providerRequestedAmount: "desc" }] },
  pending: { label: "Longest Pending", orderBy: [{ loggedAt: "asc" }] },
};

export default async function OpenNegotiationsPage(
  props: {
    searchParams: Promise<{ sort?: string; status?: string; urgency?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const sortKey = searchParams.sort && SORT_OPTIONS[searchParams.sort] ? searchParams.sort : "newest";
  const statusFilter = searchParams.status && OPEN_STATUSES.includes(searchParams.status as never) ? searchParams.status : undefined;
  const urgencyFilter =
    searchParams.urgency && Object.keys(URGENCY_LABELS).includes(searchParams.urgency) ? (searchParams.urgency as Urgency) : undefined;

  const cases = await prisma.negotiationCase.findMany({
    where: {
      status: statusFilter ? (statusFilter as never) : { in: OPEN_STATUSES },
      urgency: urgencyFilter,
    },
    orderBy: SORT_OPTIONS[sortKey].orderBy,
    include: { loggedBy: true, owner: true },
  });

  function buildHref(overrides: { sort?: string; status?: string; urgency?: string }) {
    const params = new URLSearchParams();
    const sort = overrides.sort !== undefined ? overrides.sort : sortKey;
    const status = overrides.status !== undefined ? overrides.status : statusFilter ?? "";
    const urgency = overrides.urgency !== undefined ? overrides.urgency : urgencyFilter ?? "";
    params.set("sort", sort);
    if (status) params.set("status", status);
    if (urgency) params.set("urgency", urgency);
    return `/negotiations/queue?${params.toString()}`;
  }

  return (
    <>
      <Header
        title="Open Negotiations"
        subtitle="Provider Team Queue"
        icon={<QueueIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex flex-1 flex-col gap-5 px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-ink-500">{cases.length} open case{cases.length === 1 ? "" : "s"}</p>
          <div className="flex items-center gap-2">
            {Object.entries(SORT_OPTIONS).map(([key, opt]) => (
              <Link
                key={key}
                href={buildHref({ sort: key })}
                className={`rounded-md px-3 py-1.5 text-[11.5px] font-semibold ${
                  sortKey === key ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Status</span>
            <Link
              href={buildHref({ status: "" })}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                !statusFilter ? "bg-brand text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              All Open
            </Link>
            {OPEN_STATUSES.map((status) => (
              <Link
                key={status}
                href={buildHref({ status })}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  statusFilter === status ? "bg-brand text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {CASE_STATUS_LABELS[status]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Urgency</span>
            <Link
              href={buildHref({ urgency: "" })}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                !urgencyFilter ? "bg-brand text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              All
            </Link>
            {Object.entries(URGENCY_LABELS).map(([value, label]) => (
              <Link
                key={value}
                href={buildHref({ urgency: value })}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  urgencyFilter === value ? "bg-brand text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <Card>
          <CaseTable cases={cases} viewerRole={session.user.role} />
        </Card>
      </div>
    </>
  );
}

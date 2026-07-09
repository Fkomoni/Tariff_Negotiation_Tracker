import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import { QueueIcon } from "@/components/icons";
import { CaseTable } from "@/components/CaseTable";
import { OPEN_STATUSES } from "@/lib/domain";
import type { Prisma } from "@prisma/client";

const SORT_OPTIONS: Record<string, { label: string; orderBy: Prisma.NegotiationCaseOrderByWithRelationInput[] }> = {
  oldest: { label: "Oldest First", orderBy: [{ loggedAt: "asc" }] },
  urgent: { label: "Urgent First", orderBy: [{ urgency: "desc" }, { loggedAt: "asc" }] },
  provider: { label: "Provider", orderBy: [{ providerName: "asc" }] },
  status: { label: "Status", orderBy: [{ status: "asc" }] },
  amount: { label: "Highest Amount Difference", orderBy: [{ providerRequestedAmount: "desc" }] },
  pending: { label: "Longest Pending", orderBy: [{ loggedAt: "asc" }] },
};

export default async function OpenNegotiationsPage({
  searchParams,
}: {
  searchParams: { sort?: string; status?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sortKey = searchParams.sort && SORT_OPTIONS[searchParams.sort] ? searchParams.sort : "oldest";
  const statusFilter = searchParams.status;

  const cases = await prisma.negotiationCase.findMany({
    where: {
      status: statusFilter ? (statusFilter as never) : { in: OPEN_STATUSES },
    },
    orderBy: SORT_OPTIONS[sortKey].orderBy,
    include: { loggedBy: true, owner: true },
  });

  return (
    <>
      <Header
        title="Open Negotiations"
        subtitle="Provider Team Queue"
        icon={<QueueIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex flex-1 flex-col gap-5 px-8 py-8">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] text-ink-500">{cases.length} open case{cases.length === 1 ? "" : "s"}</p>
          <div className="flex items-center gap-2">
            {Object.entries(SORT_OPTIONS).map(([key, opt]) => (
              <Link
                key={key}
                href={`/negotiations/queue?sort=${key}`}
                className={`rounded-md px-3 py-1.5 text-[11.5px] font-semibold ${
                  sortKey === key ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        <Card>
          <CaseTable cases={cases} showClaim />
        </Card>
      </div>
    </>
  );
}

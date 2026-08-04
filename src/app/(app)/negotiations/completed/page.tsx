import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { CaseTable } from "@/components/CaseTable";
import { getCaseGroupSizes } from "@/lib/case-groups";
import { CLOSED_STATUSES } from "@/lib/domain";


/** The table collapses each request to one row, so a bare case count would
 * contradict the number of rows on screen. Report both. */
function describeCounts(cases: { id: string; sessionGroupId: string | null }[], noun: string): string {
  const requests = new Set(cases.map((c) => c.sessionGroupId ?? c.id)).size;
  const requestLabel = `${requests} ${noun} request${requests === 1 ? "" : "s"}`;
  if (requests === cases.length) return requestLabel;
  return `${requestLabel} · ${cases.length} services`;
}

export default async function CompletedNegotiationsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const cases = await prisma.negotiationCase.findMany({
    where: { status: { in: CLOSED_STATUSES } },
    orderBy: { completedAt: "desc" },
    include: { loggedBy: true, owner: true },
  });

  const groupSizes = await getCaseGroupSizes(cases);

  return (
    <>
      <Header
        title="Completed Negotiations"
        subtitle="Resolved and declined cases"
        icon={<CheckIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex flex-1 flex-col gap-5 px-8 py-8">
        <p className="text-[12.5px] text-navy-500">{describeCounts(cases, "completed")}</p>
        <Card>
          <CaseTable cases={cases} viewerRole={session.user.role} groupSizes={groupSizes} variant="completed" />
        </Card>
      </div>
    </>
  );
}

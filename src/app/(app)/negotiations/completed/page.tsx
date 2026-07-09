import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { CaseTable } from "@/components/CaseTable";
import { CLOSED_STATUSES } from "@/lib/domain";

export default async function CompletedNegotiationsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const cases = await prisma.negotiationCase.findMany({
    where: { status: { in: CLOSED_STATUSES } },
    orderBy: { completedAt: "desc" },
    include: { loggedBy: true, owner: true },
  });

  return (
    <>
      <Header
        title="Completed Negotiations"
        subtitle="Resolved and declined cases"
        icon={<CheckIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex flex-1 flex-col gap-5 px-8 py-8">
        <p className="text-[12.5px] text-ink-500">{cases.length} completed case{cases.length === 1 ? "" : "s"}</p>
        <Card>
          <CaseTable cases={cases} />
        </Card>
      </div>
    </>
  );
}

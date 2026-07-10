import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { OPEN_STATUSES } from "@/lib/domain";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const openNegotiationsCount = await prisma.negotiationCase.count({ where: { status: { in: OPEN_STATUSES } } });

  return (
    <div className="flex h-screen overflow-hidden bg-ink-100/60">
      <Sidebar role={session.user.role} openNegotiationsCount={openNegotiationsCount} />
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}

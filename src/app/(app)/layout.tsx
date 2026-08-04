import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { ToastHost } from "@/components/ToastHost";
import { OPEN_STATUSES } from "@/lib/domain";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // The Edge middleware can only check for the cookie's presence now (see
  // proxy.ts) — it can't read the role behind an opaque token without
  // Prisma, which doesn't run there. This layout wraps every page under
  // (app) except pending-approval itself, so redirecting from here can't
  // loop.
  if (session.user.role === "PENDING") redirect("/pending-approval");

  const openNegotiationsCount = await prisma.negotiationCase.count({ where: { status: { in: OPEN_STATUSES } } });

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar
        role={session.user.role}
        openNegotiationsCount={openNegotiationsCount}
        userName={session.user.name ?? session.user.prognosisUsername}
      />
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      <ToastHost />
    </div>
  );
}

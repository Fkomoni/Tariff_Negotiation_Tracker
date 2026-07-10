import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

export async function logAudit(action: AuditAction, summary: string, actorUserId?: string | null) {
  await prisma.auditLog.create({
    data: { action, summary, actorUserId: actorUserId ?? null },
  });
}

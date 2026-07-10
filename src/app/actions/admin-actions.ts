"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/domain";

const assignRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM", "PENDING"]),
});

export async function assignRole(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Only an Admin can assign roles");
  }

  const data = assignRoleSchema.parse(Object.fromEntries(formData.entries()));

  const target = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!target) throw new Error("User not found");

  await prisma.user.update({
    where: { id: data.userId },
    data: { role: data.role },
  });

  if (target.role !== data.role) {
    await logAudit(
      "ROLE_CHANGE",
      `${session.user.name ?? session.user.prognosisUsername} changed ${target.displayName ?? target.prognosisUsername}'s role from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[data.role]}`,
      session.user.id
    );
  }

  revalidatePath("/configuration");
}

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

const provisionUserSchema = z.object({
  prognosisUsername: z.string().trim().min(2, "Prognosis username or email is required"),
  role: z.enum(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM", "PENDING"]),
});

/**
 * Lets an Admin set a staff member's role before they ever sign in, so
 * when they do sign in via Prognosis, the right role is already waiting
 * (matched case-insensitively in auth.ts) instead of landing on Pending.
 */
export async function provisionUser(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Only an Admin can set up staff accounts");
  }

  const data = provisionUserSchema.parse(Object.fromEntries(formData.entries()));

  const existing = await prisma.user.findFirst({
    where: { prognosisUsername: { equals: data.prognosisUsername, mode: "insensitive" } },
  });

  if (existing) {
    if (existing.role !== data.role) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: data.role } });
      await logAudit(
        "ROLE_CHANGE",
        `${session.user.name ?? session.user.prognosisUsername} changed ${existing.displayName ?? existing.prognosisUsername}'s role from ${ROLE_LABELS[existing.role]} to ${ROLE_LABELS[data.role]}`,
        session.user.id
      );
    }
  } else {
    await prisma.user.create({
      data: { prognosisUsername: data.prognosisUsername.toLowerCase(), role: data.role },
    });
    await logAudit(
      "ROLE_CHANGE",
      `${session.user.name ?? session.user.prognosisUsername} pre-provisioned ${data.prognosisUsername} with role ${ROLE_LABELS[data.role]} (not yet signed in)`,
      session.user.id
    );
  }

  revalidatePath("/configuration");
}

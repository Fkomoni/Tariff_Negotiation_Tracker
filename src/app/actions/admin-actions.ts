"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/domain";
import { resyncLookupCaches } from "@/lib/prognosis";

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

export async function deleteUser(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Only an Admin can remove staff accounts");
  }

  const userId = String(formData.get("userId"));
  if (userId === session.user.id) {
    redirect(`/configuration?error=${encodeURIComponent("You can't delete your own account while signed in as it.")}`);
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("User not found");

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      redirect(
        `/configuration?error=${encodeURIComponent(
          `Can't delete ${target.prognosisUsername}: they have existing cases, updates, or notifications on record. Set their role to Pending instead if you want to revoke access.`
        )}`
      );
    }
    throw err;
  }

  await logAudit(
    "ROLE_CHANGE",
    `${session.user.name ?? session.user.prognosisUsername} removed the staff account ${target.prognosisUsername}`,
    session.user.id
  );

  revalidatePath("/configuration");
}

/**
 * Forces an immediate refresh of the cached provider/treatment lists from
 * Prognosis, for when Prognosis's underlying data changes mid-day instead
 * of waiting for the automatic midnight refresh.
 */
export async function syncPrognosisLookups() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Only an Admin can sync Prognosis lookup data");
  }

  let message: string;
  try {
    const { providers, treatments } = await resyncLookupCaches();
    message = `Synced ${providers.toLocaleString()} providers and ${treatments.toLocaleString()} treatments from Prognosis.`;
  } catch (err) {
    redirect(`/configuration?error=${encodeURIComponent(`Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`)}`);
  }

  revalidatePath("/configuration");
  redirect(`/configuration?synced=${encodeURIComponent(message)}`);
}

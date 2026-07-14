"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/domain";
import { resyncLookupCaches } from "@/lib/procedure-catalog";
import { redirectWithToast } from "@/lib/toast";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    redirectWithToast("/configuration", { type: "error", message: "Only an Admin can do that." });
  }
  return session;
}

const assignRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM", "PENDING"]),
});

export async function assignRole(formData: FormData) {
  const session = await requireAdmin();

  const parsed = assignRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirectWithToast("/configuration", { type: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const data = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!target) {
    redirectWithToast("/configuration", { type: "error", message: "User not found." });
  }

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
  redirectWithToast("/configuration", {
    type: "success",
    message: `${target.displayName ?? target.prognosisUsername}'s role is now ${ROLE_LABELS[data.role]}.`,
  });
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
  const session = await requireAdmin();

  const parsed = provisionUserSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirectWithToast("/configuration", { type: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const data = parsed.data;

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
    try {
      await prisma.user.create({
        data: { prognosisUsername: data.prognosisUsername.toLowerCase(), role: data.role },
      });
      await logAudit(
        "ROLE_CHANGE",
        `${session.user.name ?? session.user.prognosisUsername} pre-provisioned ${data.prognosisUsername} with role ${ROLE_LABELS[data.role]} (not yet signed in)`,
        session.user.id
      );
    } catch (err) {
      // A concurrent provisionUser call for the same (case-variant)
      // username — e.g. a double-click, or two Admins adding the same
      // person at once — can race between the findFirst above and this
      // create. The database's case-insensitive unique index (see
      // prisma/schema.prisma) rejects the second insert rather than
      // creating a duplicate account; fall back to updating whichever row
      // won the race instead of showing an error for something that isn't
      // actually a failure.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await prisma.user.findFirst({
          where: { prognosisUsername: { equals: data.prognosisUsername, mode: "insensitive" } },
        });
        if (winner && winner.role !== data.role) {
          await prisma.user.update({ where: { id: winner.id }, data: { role: data.role } });
        }
      } else {
        throw err;
      }
    }
  }

  revalidatePath("/configuration");
  redirectWithToast("/configuration", { type: "success", message: `${data.prognosisUsername} is set up as ${ROLE_LABELS[data.role]}.` });
}

export async function deleteUser(formData: FormData) {
  const session = await requireAdmin();

  const userId = String(formData.get("userId"));
  if (userId === session.user.id) {
    redirectWithToast("/configuration", { type: "error", message: "You can't delete your own account while signed in as it." });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    redirectWithToast("/configuration", { type: "error", message: "User not found." });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      redirectWithToast("/configuration", {
        type: "error",
        message: `Can't delete ${target.prognosisUsername}: they have existing cases, updates, or notifications on record. Set their role to Pending instead if you want to revoke access.`,
      });
    }
    throw err;
  }

  await logAudit(
    "ROLE_CHANGE",
    `${session.user.name ?? session.user.prognosisUsername} removed the staff account ${target.prognosisUsername}`,
    session.user.id
  );

  revalidatePath("/configuration");
  redirectWithToast("/configuration", { type: "success", message: `Removed ${target.prognosisUsername}'s account.` });
}

/**
 * Forces an immediate refresh of the cached provider/treatment lists from
 * Prognosis, for when Prognosis's underlying data changes mid-day instead
 * of waiting for the automatic midnight refresh.
 */
export async function syncPrognosisLookups() {
  await requireAdmin();

  let message: string;
  try {
    const { providers, treatments } = await resyncLookupCaches();
    message = `Synced ${providers.toLocaleString()} providers and ${treatments.toLocaleString()} treatments from Prognosis.`;
  } catch (err) {
    redirectWithToast("/configuration", { type: "error", message: `Sync failed: ${err instanceof Error ? err.message : "Unknown error"}` });
  }

  revalidatePath("/configuration");
  redirectWithToast("/configuration", { type: "success", message });
}

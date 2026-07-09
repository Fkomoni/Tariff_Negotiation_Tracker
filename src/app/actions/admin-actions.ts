"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  await prisma.user.update({
    where: { id: data.userId },
    data: { role: data.role },
  });

  revalidatePath("/configuration");
}

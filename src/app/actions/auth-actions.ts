"use server";

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function logoutAction() {
  const session = await auth();
  if (session?.user) {
    // Marks every session token issued before this moment as invalid —
    // signOut() below only clears the cookie on this browser; a copy of
    // the old token captured elsewhere would otherwise still work until
    // its own expiry. See the jwt callback in src/lib/auth.ts.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { sessionInvalidatedAt: new Date() },
    });
  }
  await signOut({ redirectTo: "/login" });
}

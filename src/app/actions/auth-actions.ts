"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { destroySession, revokeAllSessionsForUser } from "@/lib/session";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Signs the current user out of every device by deleting all of their session
 * rows (including this one), then clears this browser's cookie and returns to
 * login. Any other live session - or a copied token - stops working at once. */
export async function signOutEverywhereAction() {
  const session = await auth();
  if (session?.user) await revokeAllSessionsForUser(session.user.id);
  await destroySession();
  redirect("/login");
}

import { redirect } from "next/navigation";

export type ToastType = "success" | "error";

/**
 * The one mechanism every mutating Server Action in this app uses to report
 * an outcome back to the user — appends a standardized `toast`/`toastMsg`
 * query param and redirects, read and displayed by <ToastHost/> (mounted
 * once in the (app) layout). Replaces the previous copy-pasted
 * `?error=`/`?synced=`-style params that every page hand-rolled its own
 * banner for, and the handful of actions that threw an uncaught Error on
 * failure instead of reporting anything at all.
 */
export function redirectWithToast(path: string, toast: { type: ToastType; message: string }): never {
  const separator = path.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ toast: toast.type, toastMsg: toast.message });
  redirect(`${path}${separator}${params.toString()}`);
}

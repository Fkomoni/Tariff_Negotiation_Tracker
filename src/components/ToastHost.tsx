"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertIcon, CheckMarkIcon, CloseIcon } from "@/components/icons";

type ToastState = { type: "success" | "error"; message: string } | null;

const AUTO_DISMISS_MS = 5000;

function ToastHostInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const type = searchParams.get("toast");
    const message = searchParams.get("toastMsg");
    if ((type === "success" || type === "error") && message) {
      setToast({ type, message });

      // Strip the toast params from the URL so refreshing (or sharing the
      // link) doesn't replay the same notification.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("toast");
      params.delete("toastMsg");
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(next, { scroll: false });
    }
    // Only re-run when the incoming search params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-50 max-w-sm">
      <div
        role="status"
        className={`pointer-events-auto flex items-start gap-3 rounded-lg border border-l-[3px] px-4 py-3 shadow-lg ${
          isSuccess ? "border-green-200 border-l-emerald-600 bg-[#f0fdf4]" : "border-red-200 border-l-brand bg-[#fef2f2]"
        }`}
      >
        <span
          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
            isSuccess ? "bg-emerald-600 text-white" : "bg-brand text-white"
          }`}
          aria-hidden
        >
          {isSuccess ? <CheckMarkIcon className="h-2.5 w-2.5" /> : <AlertIcon className="h-2.5 w-2.5" />}
        </span>
        <p className={`flex-1 text-[12px] font-medium leading-snug ${isSuccess ? "text-emerald-800" : "text-red-800"}`}>
          {toast.message}
        </p>
        <button
          type="button"
          onClick={() => setToast(null)}
          aria-label="Dismiss"
          className={isSuccess ? "text-emerald-500 hover:text-emerald-700" : "text-red-500 hover:text-red-700"}
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Mounted once in the (app) layout — every mutating action reports its
 * outcome by redirecting through redirectWithToast() (src/lib/toast.ts),
 * and this is what actually shows it. */
export function ToastHost() {
  return (
    <Suspense fallback={null}>
      <ToastHostInner />
    </Suspense>
  );
}

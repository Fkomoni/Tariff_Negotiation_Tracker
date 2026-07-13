"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
        className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${
          isSuccess ? "border-emerald-200 bg-emerald-50" : "border-brand-200 bg-brand-50"
        }`}
      >
        <span className={`mt-0.5 text-[15px] ${isSuccess ? "text-emerald-600" : "text-brand-600"}`} aria-hidden>
          {isSuccess ? "✓" : "⚠"}
        </span>
        <p className={`flex-1 text-[13px] font-medium leading-snug ${isSuccess ? "text-emerald-800" : "text-brand-800"}`}>
          {toast.message}
        </p>
        <button
          type="button"
          onClick={() => setToast(null)}
          aria-label="Dismiss"
          className={`text-[13px] ${isSuccess ? "text-emerald-500 hover:text-emerald-700" : "text-brand-500 hover:text-brand-700"}`}
        >
          ✕
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

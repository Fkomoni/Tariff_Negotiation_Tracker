"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

/**
 * Root-level fallback - catches anything thrown outside the (app) segment
 * (login, pending-approval, the root redirect page) and, since error.tsx
 * can't catch errors from its own segment's layout, also anything thrown
 * by (app)/layout.tsx itself before (app)/error.tsx ever gets a chance to.
 */
export default function RootSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100/60">
      <ErrorState reset={reset} homeHref="/login" />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

/**
 * Catches anything an authenticated page or Server Action throws without
 * already reporting it through redirectWithToast() — every real, expected
 * failure already goes through that path (see toast.ts), so reaching this
 * boundary means something genuinely unexpected happened. Renders inside
 * (app)/layout.tsx, so the Sidebar stays up and the user never loses
 * navigation. Doesn't catch errors thrown by (app)/layout.tsx itself —
 * that's what the root app/error.tsx is for.
 */
export default function AppSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return <ErrorState reset={reset} homeHref="/dashboard" />;
}

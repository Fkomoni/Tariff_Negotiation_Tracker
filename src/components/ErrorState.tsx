"use client";

import { AlertIcon } from "@/components/icons";

/**
 * Shared visual for every error.tsx boundary in this app. Next.js requires
 * one per segment that wants to catch its own errors, but there's no
 * reason to hand-roll the markup twice - see (app)/error.tsx and the root
 * app/error.tsx, which both just render this with a different homeHref.
 */
export function ErrorState({ reset, homeHref }: { reset: () => void; homeHref: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <AlertIcon className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-[17px] font-bold text-ink-900">Something went wrong</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          An unexpected error occurred. Anything you already saved is unaffected - try again, or head back.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-glow hover:bg-brand-600"
          >
            Try Again
          </button>
          <a
            href={homeHref}
            className="rounded-lg border border-ink-200 px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Go Back
          </a>
        </div>
      </div>
    </div>
  );
}

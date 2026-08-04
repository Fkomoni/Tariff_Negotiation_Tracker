"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AlertIcon, CloseIcon, SendIcon } from "@/components/icons";
import { RequestFields } from "@/components/RequestFields";
import { URGENCY_LABELS } from "@/lib/domain";
import { createCase, type CreateCaseState } from "@/app/actions/case-actions";
import type { ProviderInitial } from "@/components/ProviderFields";
import type { EnrolleeInitial } from "@/components/EnrolleeFields";

/**
 * Client wrapper around the log-negotiation form so a duplicate-service
 * warning can come back without throwing away everything the agent typed.
 * The action redirects (with a toast) on success and on validation errors
 * exactly as before; the only thing it ever *returns* is the
 * already-negotiated list, which renders inline below.
 */
export function LogNegotiationForm({
  initialProvider,
  initialEnrollee,
  sessionGroupId,
}: {
  initialProvider?: ProviderInitial;
  initialEnrollee?: EnrolleeInitial;
  sessionGroupId?: string;
}) {
  const [state, formAction] = useActionState<CreateCaseState | null, FormData>(createCase, null);
  const [urgency, setUrgency] = useState("ROUTINE");
  const [notes, setNotes] = useState("");
  const urgencyRef = useRef<HTMLSelectElement>(null);

  const duplicates = state?.duplicates ?? [];
  const remainingCount = state?.remainingCount ?? 0;

  /**
   * React calls form.reset() once a form action settles. For <select> that
   * reverts the DOM to the first option while React's state stays put —
   * nothing re-renders, so the two silently disagree and the *stale DOM*
   * value is what the next submit sends. Since this form is built to be
   * resubmitted (the action comes back asking about duplicate services), a
   * case entered as Medications/Urgent was getting logged as
   * Consultation/Routine. Writing state back into the select after each
   * response keeps them in sync. Text inputs and textareas don't need this
   * — React restores those itself; only <select> loses its value.
   */
  useEffect(() => {
    if (urgencyRef.current) urgencyRef.current.value = urgency;
    // Intentionally keyed on the action response, not on `urgency`: this is
    // repairing a post-reset DOM, not tracking user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} encType="multipart/form-data" className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
      <input type="hidden" name="sessionGroupId" value={sessionGroupId ?? ""} />

      {duplicates.length > 0 && (
        <Card className="border-brand-200 bg-brand-50/50 p-4 sm:col-span-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <AlertIcon className="h-2.5 w-2.5" />
            </span>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-ink-900">
                {duplicates.length === 1
                  ? "1 service has already been negotiated recently"
                  : `${duplicates.length} services have already been negotiated recently`}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-600">
                Nothing has been logged yet. Each service below already has a case for this provider and enrollee.
              </p>

              <ul className="mt-3 space-y-2">
                {duplicates.map((d) => (
                  <li key={`${d.caseId}-${d.requestedItem}`} className="rounded-md border border-brand-100 bg-white px-3 py-2">
                    <p className="text-[12.5px] font-semibold text-ink-900">{d.requestedItem}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-500">
                      Already on{" "}
                      <Link href={`/negotiations/${d.caseId}`} className="font-semibold text-brand-600 hover:underline">
                        {d.caseNumber}
                      </Link>{" "}
                      · {d.statusLabel}
                    </p>
                  </li>
                ))}
              </ul>

              {remainingCount > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {/* A submit button whose name/value the browser includes in
                      the submission, so this resubmits the identical form data
                      plus skipDuplicates=1 and the server drops just the
                      flagged lines — nothing to reconcile client-side. */}
                  <SubmitButton name="skipDuplicates" value="1" pendingLabel="Logging…">
                    Remove {duplicates.length === 1 ? "it" : "them"} and log the other {remainingCount}
                  </SubmitButton>
                  <p className="text-[11.5px] text-ink-500">
                    Or edit the flagged {duplicates.length === 1 ? "service" : "services"} above and submit again.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[12px] font-semibold text-ink-700">
                  Every service in this submission is already logged — there is nothing left to submit. Continue on the
                  existing {duplicates.length === 1 ? "case" : "cases"} above instead.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <RequestFields initialProvider={initialProvider} initialEnrollee={initialEnrollee} resyncSignal={state} />

      <Field label="Urgency" required>
        <select ref={urgencyRef} name="urgency" required className={inputClass} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          {Object.entries(URGENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" className="sm:col-span-2">
        <textarea
          name="notes"
          rows={3}
          className={inputClass}
          placeholder="Any additional context for the Provider Team"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line-subtle pt-5 sm:col-span-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-navy-700 transition-colors hover:bg-surface-muted"
        >
          <CloseIcon className="h-4 w-4" />
          Cancel
        </Link>
        <SubmitButton pendingLabel="Logging…">
          <SendIcon className="h-4 w-4" />
          Submit Request
        </SubmitButton>
      </div>
    </form>
  );
}

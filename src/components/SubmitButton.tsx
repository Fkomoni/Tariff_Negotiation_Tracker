"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Disables itself and shows a pending label while its parent form's action
 * is in flight, so a slow server action can't be double-submitted by an
 * impatient click — the cause of duplicate timeline entries/notifications
 * when a plain submit button gives no feedback.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant,
  className,
  confirmMessage,
  name,
  value,
  pending: pendingOverride,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  confirmMessage?: string;
  /** Submitted alongside the form data when *this* button is the one
   * clicked — lets one form offer several outcomes (e.g. "log as entered"
   * vs. "skip the flagged services and log the rest"). */
  name?: string;
  value?: string;
  /** Overrides the useFormStatus() reading. Needed by forms that submit via
   * onSubmit + a useActionState dispatch rather than the `action` prop —
   * useFormStatus only tracks the latter, so those forms pass their own
   * pending flag in. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      variant={variant}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

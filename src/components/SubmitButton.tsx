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
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

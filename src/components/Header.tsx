import Link from "next/link";
import { ROLE_LABELS } from "@/lib/domain";
import { logoutAction } from "@/app/actions/auth-actions";
import { ArrowLeftIcon, BellIcon, LogoutIcon, ShieldIcon } from "@/components/icons";
import type { Role } from "@prisma/client";

interface HeaderProps {
  /** Omit when the page renders its own heading in the content area (the
   * design reference keeps the top bar bare there, so showing it in both
   * places would repeat the same words twice). */
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  user: { name: string; role: Role };
  actions?: React.ReactNode;
  /** Shown as a count badge on the bell - omitted when there's nothing to flag. */
  alertCount?: number;
  /** Renders a back arrow to the left of the title. */
  backHref?: string;
  /** Rendered beside the title - used for a case's current status. */
  badge?: React.ReactNode;
}

export function Header({ title, subtitle, user, actions, alertCount = 0, backHref, badge }: HeaderProps) {
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  return (
    <header className="flex items-center justify-between border-b border-line-subtle bg-white px-8 py-3.5">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-navy-500 transition-colors hover:bg-surface-muted hover:text-navy-900"
          >
            <ArrowLeftIcon className="h-[18px] w-[18px]" />
          </Link>
        )}
        <div>
          {title && (
            <div className="flex items-center gap-2.5">
              <h1 className="text-[19px] font-bold leading-tight text-navy-900">{title}</h1>
              {badge}
            </div>
          )}
          {title && subtitle && <p className="text-[12.5px] text-navy-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {actions}

        <Link
          href="/negotiations/queue"
          aria-label={alertCount > 0 ? `${alertCount} open negotiations` : "Open negotiations"}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-navy-500 transition-colors hover:bg-surface-muted hover:text-navy-900"
        >
          <BellIcon className="h-[19px] w-[19px]" />
          {alertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        <span className="h-8 w-px bg-line-subtle" />

        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-surface-muted">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-[12px] font-bold text-white">
              {initials}
            </span>
            <span className="text-left">
              <span className="block text-[13px] font-semibold leading-tight text-navy-900">{user.name}</span>
              <span className="block text-[11px] leading-tight text-navy-500">{ROLE_LABELS[user.role]}</span>
            </span>
          </summary>
          <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-line-subtle bg-white py-1 shadow-panel">
            <Link
              href="/account/security"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-navy-700 hover:bg-surface-muted"
            >
              <ShieldIcon className="h-4 w-4 text-navy-400" />
              Account Security
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-navy-700 hover:bg-surface-muted"
              >
                <LogoutIcon className="h-4 w-4 text-navy-400" />
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}

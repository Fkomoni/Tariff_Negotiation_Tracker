type IconProps = { className?: string };

const base = "h-[18px] w-[18px]";

export function DashboardIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function LogIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
    </svg>
  );
}

export function QueueIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="20" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReportIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function InsightIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 11.5l1.6-2 1.4 1.5 2-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ConfigIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ShieldIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BellIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6 9a6 6 0 1112 0c0 3 1 4.5 1.5 5.5H4.5C5 13.5 6 12 6 9z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 004 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Bare checkmark, no outline — for use inside an already-colored circle (toasts, status dots). */
export function CheckMarkIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Bare exclamation mark, no outline — for use inside an already-colored circle (toasts, alert badges). */
export function AlertIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 6v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LogoutIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Icons added for the navy/orange screens: field affordances, the login
 * feature list, and the sidebar help card. Same 24-box, 1.8 stroke,
 * currentColor conventions as everything above. */

export function UserIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 20c1.4-3.4 4.2-5.2 7.5-5.2s5.9 1.8 7.5 5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.2" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function HeadsetIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4.5 14v-2a7.5 7.5 0 0115 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="2.8" y="13.4" width="4" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <rect x="17.2" y="13.4" width="4" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.2 19.4v.6a2.4 2.4 0 01-2.4 2.4H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9.5 5.5l6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M19 12H5m0 0l6.5-6.5M5 12l6.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12h14m0 0l-6.5-6.5M19 12l-6.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SendIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 3L10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BuildingIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="3.5" width="12" height="17" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 9h3.2a.8.8 0 01.8.8v9.9a.8.8 0 01-.8.8H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 7.5h5M7.5 11h5M7.5 14.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TagIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20.5 12.8l-7.7 7.7a2 2 0 01-2.9 0l-6.4-6.4a2 2 0 01-.6-1.4V4.9a1.4 1.4 0 011.4-1.4h7.8c.5 0 1 .2 1.4.6l7 7a2 2 0 010 2.9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.6" cy="8.6" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function SearchIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function FlagIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5.5 21V4m0 0h11l-2 4 2 4h-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8.2" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function UsersIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 20c1.2-3 3.4-4.6 6-4.6S13.8 17 15 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 5.2a3.2 3.2 0 010 5.9M18 20c-.5-1.9-1.3-3.2-2.4-4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SortIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M8 4v16m0 0l-3.5-3.5M8 20l3.5-3.5M16 20V4m0 0l-3.5 3.5M16 4l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tiny up/down pair for a sortable column header. Filled arrow marks the
 * direction currently applied; both muted when the column isn't the sort. */
export function SortArrows({ className = "", active }: { className?: string; active?: "asc" | "desc" | null }) {
  return (
    <svg viewBox="0 0 10 14" fill="none" className={className} aria-hidden>
      <path d="M5 1.5l3 3.5H2l3-3.5z" fill="currentColor" opacity={active === "asc" ? 1 : 0.28} />
      <path d="M5 12.5l3-3.5H2l3 3.5z" fill="currentColor" opacity={active === "desc" ? 1 : 0.28} />
    </svg>
  );
}

export function BoltIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinusCircleIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.8 7l7.1 5.2c.65.48 1.55.48 2.2 0L20.2 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6.5 3.5h2.2l1.6 4-2 1.4a11 11 0 005.4 5.4l1.4-2 4 1.6v2.2a2 2 0 01-2.2 2A15.5 15.5 0 014.5 5.7a2 2 0 012-2.2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Naira sign in a circle — marks the money fields on a case. */
export function NairaIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.6 16.5v-9l6.8 9v-9M7.4 10.6h9.2M7.4 13.4h9.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M20.5 12a8.5 8.5 0 01-14.6 5.9M3.5 12a8.5 8.5 0 0114.6-5.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.1 2.6v3.5h-3.5M5.9 21.4v-3.5h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HourglassIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 3h10M7 21h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 3v3.2c0 1.1.5 2.1 1.3 2.8L12 11.4l2.7-2.4c.8-.7 1.3-1.7 1.3-2.8V3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 21v-3.2c0-1.1.5-2.1 1.3-2.8L12 12.6l2.7 2.4c.8.7 1.3 1.7 1.3 2.8V21" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendUpIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 17l6-6 4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 9h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendDownIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 7l6 6 4-4 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 10v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

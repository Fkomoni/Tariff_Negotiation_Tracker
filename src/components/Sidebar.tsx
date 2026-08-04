"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { JSX } from "react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/domain";
import {
  DashboardIcon,
  LogIcon,
  QueueIcon,
  CheckIcon,
  ReportIcon,
  InsightIcon,
  ConfigIcon,
  ShieldIcon,
  UsersIcon,
  HeadsetIcon,
  ChevronRightIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  roles?: Role[];
}

/** Split into the same two groups the design reference uses. Admin-only
 * destinations sit under their own heading instead of trailing the main list. */
const MAIN_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/negotiations/new", label: "Log Negotiation", icon: LogIcon, roles: ["CONTACT_CENTER", "ADMIN"] },
  { href: "/negotiations/queue", label: "Open Negotiations", icon: QueueIcon, roles: ["CONTACT_CENTER", "PROVIDER_TEAM", "ADMIN"] },
  { href: "/negotiations/completed", label: "Completed Negotiations", icon: CheckIcon },
  { href: "/reports", label: "Reports", icon: ReportIcon },
  { href: "/tariff-review", label: "Tariff Review Insights", icon: InsightIcon },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/configuration", label: "Configuration", icon: UsersIcon, roles: ["ADMIN"] },
  { href: "/account/security", label: "Account Security", icon: ConfigIcon },
  { href: "/audit-log", label: "Audit Log", icon: ShieldIcon, roles: ["ADMIN"] },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-6 pb-2 pt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy-400">{children}</p>;
}

export function Sidebar({
  role,
  openNegotiationsCount = 0,
  userName,
}: {
  role: Role;
  openNegotiationsCount?: number;
  userName?: string;
}) {
  const pathname = usePathname();

  function renderItem(item: NavItem) {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
          active
            ? "bg-accent font-semibold text-white shadow-cta"
            : "font-medium text-navy-200 hover:bg-white/[0.07] hover:text-white"
        }`}
      >
        <Icon className="h-[18px] w-[18px] flex-shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.href === "/negotiations/queue" && openNegotiationsCount > 0 && (
          <span
            className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold ${
              active ? "bg-white/25 text-white" : "bg-accent text-white"
            }`}
          >
            {openNegotiationsCount}
          </span>
        )}
      </Link>
    );
  }

  const visibleAdmin = ADMIN_ITEMS.filter((i) => !i.roles || i.roles.includes(role));
  const initials = (userName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  return (
    <aside className="flex h-full w-[265px] flex-shrink-0 flex-col bg-navy-900">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-[48px] flex-shrink-0 items-center rounded-xl bg-white px-2.5 shadow-panel">
          <Image src="/leadway-logo.png" alt="Leadway Health" width={1370} height={453} unoptimized className="h-[22px] w-auto" />
        </div>
        <span className="h-7 w-px flex-shrink-0 bg-white/20" />
        <p className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/80">Staff Portal</p>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto">
        <SectionLabel>Main</SectionLabel>
        <nav className="flex flex-col gap-1">{MAIN_ITEMS.filter((i) => !i.roles || i.roles.includes(role)).map(renderItem)}</nav>

        {visibleAdmin.length > 0 && (
          <>
            <div className="mx-6 my-4 h-px bg-white/10" />
            <SectionLabel>Admin</SectionLabel>
            <nav className="flex flex-col gap-1">{visibleAdmin.map(renderItem)}</nav>
          </>
        )}
      </div>

      <Link
        href="/account/security"
        className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-3 transition-colors hover:bg-white/[0.09]"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-accent">
          <HeadsetIcon className="h-[17px] w-[17px]" />
        </span>
        <span className="flex-1">
          <span className="block text-[12.5px] font-semibold text-white">Need Help?</span>
          <span className="block text-[11px] font-medium text-accent">Contact IT Help Desk</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-navy-400" />
      </Link>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-navy-700 text-[12px] font-bold text-white">
            {initials}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-navy-900 bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-white">{userName ?? "Signed in"}</span>
            <span className="block truncate text-[11px] text-navy-400">{ROLE_LABELS[role]}</span>
          </span>
        </div>
        <p className="mt-3 text-[10.5px] leading-snug text-navy-400">
          Authorised personnel only. All access is logged and monitored.
        </p>
      </div>
    </aside>
  );
}

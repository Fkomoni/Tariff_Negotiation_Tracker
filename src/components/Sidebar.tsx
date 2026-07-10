"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  DashboardIcon,
  LogIcon,
  QueueIcon,
  CheckIcon,
  ReportIcon,
  InsightIcon,
  ConfigIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/negotiations/new", label: "Log Negotiation", icon: LogIcon, roles: ["CONTACT_CENTER", "ADMIN"] },
  { href: "/negotiations/queue", label: "Open Negotiations", icon: QueueIcon, roles: ["PROVIDER_TEAM", "ADMIN"] },
  { href: "/negotiations/completed", label: "Completed Negotiations", icon: CheckIcon },
  { href: "/reports", label: "Reports", icon: ReportIcon },
  { href: "/tariff-review", label: "Tariff Review Insights", icon: InsightIcon },
  { href: "/configuration", label: "Configuration", icon: ConfigIcon, roles: ["ADMIN"] },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[264px] flex-shrink-0 flex-col bg-ink-950 text-ink-200">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-glow">
          <Image src="/leadway-mark.png" alt="Leadway Health" width={453} height={453} className="h-9 w-9" />
        </div>
        <div>
          <p className="text-[15px] font-bold leading-tight text-white">Leadway Health</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Tariff Negotiation</p>
        </div>
      </div>

      <p className="mt-2 px-6 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
        Main Menu
      </p>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-brand text-white shadow-glow"
                  : "text-ink-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-800 px-4 py-4 text-[11px] leading-snug text-ink-500">
        Authorised personnel only. All access is logged and monitored.
      </div>
    </aside>
  );
}

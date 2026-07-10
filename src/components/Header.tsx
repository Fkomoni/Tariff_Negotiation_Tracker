import Image from "next/image";
import { ROLE_LABELS } from "@/lib/domain";
import { logoutAction } from "@/app/actions/auth-actions";
import { BellIcon, LogoutIcon } from "@/components/icons";
import type { Role } from "@prisma/client";

interface HeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  user: { name: string; role: Role };
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, user, actions }: HeaderProps) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="flex items-center justify-between border-b border-ink-100 bg-white px-8 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-white">
          <Image src="/leadway-mark.png" alt="Leadway Health" width={453} height={453} unoptimized className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold leading-tight text-ink-900">{title}</h1>
          {subtitle && <p className="text-[12.5px] text-ink-400">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {actions}
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-100"
          aria-label="Notifications"
        >
          <BellIcon className="h-4.5 w-4.5" />
        </button>

        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-ink-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">
              {initial}
            </span>
            <span className="text-left">
              <span className="block text-[13px] font-semibold leading-tight text-ink-900">{user.name}</span>
              <span className="block text-[11px] leading-tight text-ink-400">{ROLE_LABELS[user.role]}</span>
            </span>
          </summary>
          <div className="absolute right-0 top-11 z-10 w-44 rounded-lg border border-ink-100 bg-white py-1 shadow-lg">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-ink-100"
              >
                <LogoutIcon className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}

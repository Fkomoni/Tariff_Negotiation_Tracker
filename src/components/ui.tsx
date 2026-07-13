import type { ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-ink-100 bg-white ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
      <div className="flex items-center gap-2.5">
        {icon && <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>}
        <div>
          <p className="text-[13.5px] font-bold text-ink-900">{title}</p>
          {subtitle && <p className="text-[11.5px] text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Badge({ className = "", children }: { className?: string; children: ReactNode }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit" | "reset";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<string, string> = {
    primary: "bg-brand text-white hover:bg-brand-600 shadow-sm disabled:bg-ink-200 disabled:text-ink-400",
    secondary: "bg-ink-100 text-ink-800 hover:bg-ink-200",
    ghost: "bg-transparent text-ink-600 hover:bg-ink-100",
    danger: "bg-ink-900 text-white hover:bg-ink-800",
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StatTile({ label, value, tone = "default", hint }: { label: string; value: ReactNode; tone?: "default" | "brand" | "warn" | "good"; hint?: string }) {
  const toneClass: Record<string, string> = {
    default: "text-ink-900",
    brand: "text-brand-600",
    warn: "text-amber-600",
    good: "text-emerald-600",
  };
  return (
    <Card className="px-5 py-4">
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1.5 text-[26px] font-extrabold leading-none ${toneClass[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-ink-400">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
      <p className="text-[14px] font-semibold text-ink-600">{title}</p>
      {subtitle && <p className="text-[12.5px] text-ink-400">{subtitle}</p>}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-[13.5px] text-ink-900 placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none";

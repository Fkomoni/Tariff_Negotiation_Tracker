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
    secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    ghost: "bg-transparent text-ink-600 hover:bg-ink-100",
    danger: "bg-ink-900 text-white hover:bg-ink-800",
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-[7px] px-3 py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StatTile({
  label,
  value,
  tone = "default",
  hint,
  delta,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "brand" | "warn" | "good";
  hint?: string;
  /** Small colored change indicator (e.g. "+12% vs last week") — green when positive, brand red when negative. */
  delta?: { text: string; positive: boolean };
}) {
  const toneClass: Record<string, string> = {
    default: "text-ink-900",
    brand: "text-brand-600",
    warn: "text-accent-600",
    good: "text-emerald-600",
  };
  const accentBorder: Record<string, string> = {
    default: "border-l-sky-500",
    brand: "border-l-brand",
    warn: "border-l-accent",
    good: "border-l-emerald-600",
  };
  return (
    <Card className={`border-l-[3px] px-4 py-3.5 ${accentBorder[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none tracking-tight ${toneClass[tone]}`}>{value}</p>
      {delta && (
        <p className={`mt-1 text-[10.5px] font-medium ${delta.positive ? "text-emerald-600" : "text-brand"}`}>
          {delta.text}
        </p>
      )}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
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
  "w-full rounded-[7px] border border-[#e2e5ea] bg-[#f5f6f8] px-2.5 py-[7px] text-[12px] text-ink-900 placeholder:text-ink-300 focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none";

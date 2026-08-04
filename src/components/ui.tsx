import type { ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line-subtle bg-white shadow-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
      <div className="flex items-center gap-2.5">
        {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent">{icon}</div>}
        <div>
          <p className="text-[14px] font-bold text-navy-900">{title}</p>
          {subtitle && <p className="text-[11.5px] text-navy-500">{subtitle}</p>}
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
    primary: "bg-accent text-white hover:bg-accent-600 shadow-cta disabled:bg-navy-400 disabled:text-white/70 disabled:shadow-none",
    secondary: "border border-line bg-white text-navy-700 hover:bg-surface-muted",
    ghost: "bg-transparent text-navy-600 hover:bg-surface-muted",
    danger: "bg-brand text-white hover:bg-brand-600",
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
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
      <span className="mb-1.5 block text-[12.5px] font-semibold text-navy-900">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-navy-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[13px] text-navy-900 placeholder:text-navy-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-navy-400 resize-none";

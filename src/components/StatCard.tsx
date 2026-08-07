import type { ReactNode } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/Sparkline";
import { TrendUpIcon, TrendDownIcon } from "@/components/icons";
import type { DailyPoint } from "@/lib/dashboard";

/**
 * One dashboard headline figure: a coloured top rule, an icon tile, the value,
 * a note about how it moved, and its own trend line.
 *
 * Tones are named by role rather than by colour so a card can be recoloured
 * without renaming it at every call site.
 */
export type StatTone = "info" | "danger" | "success" | "primary" | "accent" | "warning" | "violet" | "teal";

const TONE: Record<StatTone, { rule: string; tile: string; line: string }> = {
  info: { line: "#0ea5e9", rule: "bg-sky-500", tile: "bg-sky-50 text-sky-600" },
  danger: { line: "#C8102E", rule: "bg-brand", tile: "bg-brand-50 text-brand-600" },
  success: { line: "#10b981", rule: "bg-emerald-500", tile: "bg-emerald-50 text-emerald-600" },
  primary: { line: "#6366f1", rule: "bg-indigo-500", tile: "bg-indigo-50 text-indigo-600" },
  accent: { line: "#E87722", rule: "bg-accent", tile: "bg-accent-50 text-accent" },
  warning: { line: "#f59e0b", rule: "bg-amber-500", tile: "bg-amber-50 text-amber-600" },
  violet: { line: "#8b5cf6", rule: "bg-violet-500", tile: "bg-violet-50 text-violet-600" },
  teal: { line: "#14b8a6", rule: "bg-teal-500", tile: "bg-teal-50 text-teal-600" },
};

export function StatCard({
  label,
  value,
  icon,
  tone,
  note,
  /** Positive/negative colouring for `note`. A rise in resolution time is bad
   * while a rise in completions is good, so direction alone can't decide it. */
  noteTone,
  series,
  sublabel,
  id,
  href,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: StatTone;
  note?: ReactNode;
  noteTone?: "good" | "bad" | "neutral";
  series?: DailyPoint[];
  sublabel?: ReactNode;
  /** Keeps this card's SVG gradient id unique in the document. */
  id: string;
  /** Where this figure comes from. Given one, the whole card is a link - the
   * number is the question and that page is the answer. */
  href?: string;
}) {
  const t = TONE[tone];
  const noteClass =
    noteTone === "good" ? "text-emerald-600" : noteTone === "bad" ? "text-brand-600" : "text-navy-400";

  const body = (
    <>
      <span className={`absolute inset-x-0 top-0 h-[3px] ${t.rule}`} />

      <div className="px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${t.tile}`}>{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-navy-400">{label}</p>
            <p className="mt-0.5 truncate text-[22px] font-bold leading-tight text-navy-900" title={typeof value === "string" ? value : undefined}>
              {value}
            </p>
          </div>
        </div>

        {sublabel && <div className="mt-1.5 text-[11px] leading-snug text-navy-500">{sublabel}</div>}

        <div className="mt-2 flex items-end justify-between gap-3">
          <p className={`flex items-center gap-1 text-[11px] font-semibold ${noteClass}`}>
            {noteTone === "good" && <TrendUpIcon className="h-3 w-3" />}
            {noteTone === "bad" && <TrendDownIcon className="h-3 w-3" />}
            {note}
          </p>
          {series && series.length > 1 && (
            <Sparkline points={series} stroke={t.line} gradientId={`spark-${id}`} className="h-8 w-[110px] flex-shrink-0" />
          )}
        </div>
      </div>
    </>
  );

  const shell = "relative block overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-card";

  if (!href) return <div className={shell}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${shell} transition-shadow hover:border-line hover:shadow-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {body}
    </Link>
  );
}

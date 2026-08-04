import Link from "next/link";
import { Card } from "@/components/ui";
import { DownloadIcon, SearchIcon } from "@/components/icons";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, URGENCY_LABELS } from "@/lib/domain";
import { describeFilters, type ReportFilters } from "@/lib/report-filters";
import type { CaseStatus, CaseType, Urgency } from "@prisma/client";

/**
 * The filter bar for the Reports page.
 *
 * A plain GET form, so filters live in the URL — which means a filtered report
 * can be bookmarked, shared with a colleague, or linked to from the dashboard,
 * and the export buttons can carry the identical query string. That's the whole
 * reason this isn't client state.
 */
export function ReportFilterBar({
  filters,
  exportQuery,
  matchCount,
}: {
  filters: ReportFilters;
  /** The active filters, already serialised — appended to each export link so a
   * download matches exactly what's on screen. */
  exportQuery: string;
  matchCount: number;
}) {
  const box = "rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] text-navy-900 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";
  const legend = "mb-2 block text-[10.5px] font-bold uppercase tracking-wide text-navy-400";

  function CheckGroup<T extends string>({
    name,
    labels,
    selected,
  }: {
    name: string;
    labels: Record<T, string>;
    selected: T[];
  }) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.entries(labels) as [T, string][]).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-[12px] text-navy-700">
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={selected.includes(value)}
              className="h-3.5 w-3.5 rounded border-line accent-accent"
            />
            {label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <form action="/reports" method="GET">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-navy-900">From</span>
              <input type="date" name="from" defaultValue={filters.from ?? ""} className={box} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-navy-900">To</span>
              <input type="date" name="to" defaultValue={filters.to ?? ""} className={box} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-navy-900">Provider contains</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  name="provider"
                  defaultValue={filters.provider}
                  placeholder="e.g. Pharmacy Benefit"
                  className={`${box} w-[230px] pl-9`}
                />
              </div>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-cta hover:bg-accent-600"
            >
              Apply filters
            </button>
            {!filters.isUnfiltered && (
              <Link href="/reports" className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-navy-600 hover:bg-surface-muted">
                Clear
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 border-t border-line-subtle px-5 py-4 sm:grid-cols-3">
          <div>
            <span className={legend}>Case Type</span>
            <CheckGroup<CaseType> name="caseType" labels={CASE_TYPE_LABELS} selected={filters.caseType} />
          </div>
          <div>
            <span className={legend}>Urgency</span>
            <CheckGroup<Urgency> name="urgency" labels={URGENCY_LABELS} selected={filters.urgency} />
          </div>
          <div>
            <span className={legend}>Status</span>
            <CheckGroup<CaseStatus> name="status" labels={CASE_STATUS_LABELS} selected={filters.status} />
          </div>
        </div>
      </form>

      {/* Export links sit outside the form on purpose: they must carry the
          *applied* filters, not whatever is currently typed into the boxes
          above but not yet submitted. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle bg-surface-muted px-5 py-3">
        <p className="text-[12px] text-navy-600">
          <span className="font-semibold text-navy-900">
            {matchCount} case{matchCount === 1 ? "" : "s"}
          </span>{" "}
          · {describeFilters(filters)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold text-navy-500">Download this view:</span>
          <ExportLink href={`/api/reports/export?${exportQuery}`} label="Excel (.xlsx)" />
          <ExportLink href={`/api/reports/export?format=csv&${exportQuery}`} label="CSV" />
          <ExportLink href={`/reports/print?${exportQuery}`} label="PDF" newTab />
        </div>
      </div>
    </Card>
  );
}

function ExportLink({ href, label, newTab }: { href: string; label: string; newTab?: boolean }) {
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[11.5px] font-semibold text-navy-700 hover:bg-surface-muted"
    >
      <DownloadIcon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

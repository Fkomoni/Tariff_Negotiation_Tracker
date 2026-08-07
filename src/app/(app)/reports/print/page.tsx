import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  groupByProvider,
  groupByItem,
  delayBreakdown,
  tariffAgreedVsOriginal,
  agentLogCounts,
} from "@/lib/reports";
import { parseReportFilters, describeFilters } from "@/lib/report-filters";
import { formatCurrency, formatDuration, formatDateTime, DISPLAY_TIME_ZONE } from "@/lib/domain";
import { PrintTrigger } from "./PrintTrigger";

/**
 * Print-ready version of the Reports page, for producing a PDF.
 *
 * Rendered as a page the browser prints rather than generated server-side with
 * a PDF library, on purpose:
 *
 *  - Every browser and OS already has a well-tested "Save as PDF", so this
 *    needs no extra dependency, no bundled fonts, and no headless browser on
 *    the server - the last of which would be the heaviest thing in this app by
 *    a wide margin, for one button.
 *  - The output uses the same numbers and the same formatting helpers as the
 *    screen, so the PDF can't drift away from what the page shows.
 *
 * It shares the Reports page's filter parsing, so a PDF covers exactly the
 * cases the filter bar had selected when the link was followed.
 */
export default async function ReportsPrintPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.set(k, v);
  }
  const filters = parseReportFilters(params);

  const cases = await prisma.negotiationCase.findMany({
    where: filters.where,
    include: { loggedBy: true, owner: true },
    orderBy: { loggedAt: "desc" },
  });

  const byProvider = groupByProvider(cases);
  const byItem = groupByItem(cases).slice(0, 15);
  const delay = delayBreakdown(cases);
  const agreed = tariffAgreedVsOriginal(cases).slice(0, 20);
  const agents = agentLogCounts(cases);
  const totalExtra = byProvider.reduce((s, p) => s + p.totalExtra, 0);

  const th = "border-b border-slate-300 px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-2 py-1.5 text-[10px] text-slate-800";
  const num = `${td} text-right tabular-nums`;

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-slate-900 print:p-0">
      <PrintTrigger />

      {/* Screen-only bar; print:hidden keeps it out of the PDF. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3 print:hidden">
        <p className="text-[12.5px] text-navy-600">
          Your browser&apos;s print dialog should be open - choose <strong>Save as PDF</strong> as the destination.
        </p>
        <a href="/reports" className="text-[12.5px] font-semibold text-accent hover:underline">
          ← Back to Reports
        </a>
      </div>

      <header className="mb-5 border-b-2 border-slate-800 pb-3">
        <h1 className="text-[19px] font-bold">Provider Tariff Negotiation Report</h1>
        <p className="text-[11px] text-slate-600">Leadway Health · Provider Management Unit</p>
        <dl className="mt-2 space-y-0.5 text-[9.5px] text-slate-600">
          <div>
            <dt className="inline font-semibold">Scope: </dt>
            <dd className="inline">{describeFilters(filters)}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Cases included: </dt>
            <dd className="inline">{cases.length}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Generated: </dt>
            <dd className="inline">
              {formatDateTime(new Date())} ({DISPLAY_TIME_ZONE}) by{" "}
              {session.user.name ?? session.user.prognosisUsername}
            </dd>
          </div>
        </dl>
      </header>

      <section className="mb-5 grid grid-cols-4 gap-3">
        {[
          { label: "Total Extra Requested", value: formatCurrency(totalExtra) },
          { label: "Avg. Log → First Action", value: delay.avgFirstActionMs !== null ? formatDuration(delay.avgFirstActionMs) : "-" },
          { label: "Avg. First Action → Completion", value: delay.avgNegotiationMs !== null ? formatDuration(delay.avgNegotiationMs) : "-" },
          { label: "Avg. Log → Completion", value: delay.avgTotalMs !== null ? formatDuration(delay.avgTotalMs) : "-" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-slate-300 px-2.5 py-2">
            <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-0.5 text-[13px] font-bold">{s.value}</p>
          </div>
        ))}
      </section>

      {/* break-inside-avoid stops a table being split mid-row across pages. */}
      <Section title="Negotiations by Provider">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Provider</th>
              <th className={`${th} text-right`}>Cases</th>
              <th className={`${th} text-right`}>Current Total</th>
              <th className={`${th} text-right`}>Requested Total</th>
              <th className={`${th} text-right`}>Extra Requested</th>
            </tr>
          </thead>
          <tbody>
            {byProvider.map((p) => (
              <tr key={p.providerName}>
                <td className={td}>{p.providerName}</td>
                <td className={num}>{p.count}</td>
                <td className={num}>{formatCurrency(p.totalCurrent)}</td>
                <td className={num}>{formatCurrency(p.totalRequested)}</td>
                <td className={`${num} font-semibold`}>{formatCurrency(p.totalExtra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Most Frequently Negotiated Items">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Service / Item</th>
              <th className={`${th} text-right`}>Times Negotiated</th>
              <th className={`${th} text-right`}>Total Extra Requested</th>
            </tr>
          </thead>
          <tbody>
            {byItem.map((i) => (
              <tr key={i.item}>
                <td className={td}>{i.item}</td>
                <td className={num}>{i.count}</td>
                <td className={num}>{formatCurrency(i.totalExtra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {agreed.length > 0 && (
        <Section title="Final Agreed vs Original Tariff">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Case</th>
                <th className={th}>Provider</th>
                <th className={`${th} text-right`}>Original</th>
                <th className={`${th} text-right`}>Final Agreed</th>
                <th className={`${th} text-right`}>Change</th>
              </tr>
            </thead>
            <tbody>
              {agreed.map((r) => (
                <tr key={r.case.id}>
                  <td className={td}>{r.case.caseNumber}</td>
                  <td className={td}>{r.case.providerName}</td>
                  <td className={num}>{formatCurrency(r.current)}</td>
                  <td className={num}>{formatCurrency(r.final)}</td>
                  <td className={`${num} font-semibold`}>
                    {r.diff > 0 ? "+" : ""}
                    {formatCurrency(r.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {agents.length > 0 && (
        <Section title="Requests Logged by Agent">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Agent</th>
                <th className={`${th} text-right`}>Requests Logged</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.name}>
                  <td className={td}>{a.name}</td>
                  <td className={num}>{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <footer className="mt-6 border-t border-slate-300 pt-2 text-[8.5px] text-slate-500">
        Leadway Health · Provider Tariff Negotiation Tracker · Confidential - authorised personnel only. All access is
        logged and monitored.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

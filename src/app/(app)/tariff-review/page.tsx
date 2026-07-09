import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, Badge } from "@/components/ui";
import { InsightIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/domain";
import { tariffReviewCandidates } from "@/lib/reports";

export default async function TariffReviewInsightsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const cases = await prisma.negotiationCase.findMany({
    include: { loggedBy: true, owner: true },
  });

  const candidates = tariffReviewCandidates(cases);

  return (
    <>
      <Header
        title="Tariff Review Insights"
        subtitle="Services & items where providers consistently ask for more than the standard tariff"
        icon={<InsightIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-6 px-8 py-8">
        <Card className="border-brand-100 bg-brand-50/40 px-5 py-4">
          <p className="text-[13px] text-brand-800">
            An item appears below once at least two separate negotiations requested more than the current
            tariff. High frequency combined with a high average markup is a strong signal the standard
            tariff for that item may need to be revised.
          </p>
        </Card>

        <Card>
          <CardHeader title="Items That May Need Tariff Review" subtitle="Sorted by frequency × average markup" />
          {candidates.length === 0 ? (
            <p className="px-5 py-6 text-[12.5px] text-ink-400">
              Not enough repeated negotiation history yet to surface tariff review candidates.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-5 py-2.5">Item / Service</th>
                    <th className="px-5 py-2.5">Times Negotiated Up</th>
                    <th className="px-5 py-2.5">Avg Markup Requested</th>
                    <th className="px-5 py-2.5">Avg Extra Amount</th>
                    <th className="px-5 py-2.5">Providers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {candidates.map((c) => (
                    <tr key={c.item}>
                      <td className="px-5 py-3 font-semibold text-ink-900">{c.item}</td>
                      <td className="px-5 py-3 text-ink-800">{c.count}</td>
                      <td className="px-5 py-3">
                        <Badge className={c.avgExtraPct > 50 ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-800"}>
                          +{c.avgExtraPct.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-ink-800">{formatCurrency(c.avgExtraAmount)}</td>
                      <td className="px-5 py-3 text-ink-600">{c.providers.slice(0, 3).join(", ")}{c.providers.length > 3 ? ` +${c.providers.length - 3} more` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

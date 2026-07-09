import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card, Field, Button, inputClass } from "@/components/ui";
import { LogIcon } from "@/components/icons";
import { createCase } from "@/app/actions/case-actions";
import { URGENCY_LABELS } from "@/lib/domain";
import { ProviderAndServiceFields } from "@/components/ProviderAndServiceFields";
import { EnrolleeFields } from "@/components/EnrolleeFields";

export default async function LogNegotiationPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <>
      <Header
        title="Log Negotiation Request"
        subtitle="Leadway Health · Provider Tariff Negotiation"
        icon={<LogIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="mx-auto w-full max-w-3xl px-8 py-8">
        <Card className="p-6">
          <h2 className="text-[15px] font-bold text-ink-900">New Provider Tariff Negotiation</h2>
          <p className="mt-1 text-[12.5px] text-ink-400">
            The timer starts the moment this request is logged. Your name and the current time are
            recorded automatically.
          </p>

          {searchParams.error && (
            <p className="mt-4 rounded-lg bg-brand-50 px-3.5 py-2.5 text-[12.5px] font-medium text-brand-700">
              {searchParams.error}
            </p>
          )}

          <form action={createCase} className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <ProviderAndServiceFields />

            <EnrolleeFields />

            <Field label="Provider Requested Amount (₦)" required>
              <input name="providerRequestedAmount" type="number" min="0" step="0.01" required className={inputClass} />
            </Field>

            <Field label="Urgency" required>
              <select name="urgency" required className={inputClass} defaultValue="ROUTINE">
                {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reason Provider Is Negotiating" required className="sm:col-span-2">
              <textarea name="reason" required rows={3} className={inputClass} placeholder="e.g. Provider says current tariff is below their cost for this procedure" />
            </Field>

            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" rows={3} className={inputClass} placeholder="Any additional context for the Provider Team" />
            </Field>

            <div className="flex justify-end gap-3 sm:col-span-2">
              <Button type="submit">Log Request</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

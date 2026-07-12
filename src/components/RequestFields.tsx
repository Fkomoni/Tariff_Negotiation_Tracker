"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { ProviderFields, type ProviderInitial } from "@/components/ProviderFields";
import { ServiceTariffFields } from "@/components/ServiceTariffFields";
import { EnrolleeFields, type EnrolleeInitial } from "@/components/EnrolleeFields";
import { ProviderManagementCategoryFields } from "@/components/ProviderManagementCategoryFields";
import { SERVICE_TYPE_LABELS, CASE_TYPE_LABELS } from "@/lib/domain";

type CaseType = "TARIFF_UPDATE" | "PROVIDER_MANAGEMENT";

export function RequestFields({
  initialProvider,
  initialEnrollee,
}: {
  initialProvider?: ProviderInitial;
  initialEnrollee?: EnrolleeInitial;
}) {
  const [caseType, setCaseType] = useState<CaseType>("TARIFF_UPDATE");
  const [providerCode, setProviderCode] = useState(initialProvider?.code ?? "");
  const isTariffUpdate = caseType === "TARIFF_UPDATE";

  return (
    <>
      <input type="hidden" name="caseType" value={caseType} />

      <div className="flex items-center gap-2 sm:col-span-2">
        {(["TARIFF_UPDATE", "PROVIDER_MANAGEMENT"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setCaseType(type)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
              caseType === type ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {CASE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <ProviderFields initial={initialProvider} onProviderCodeChange={setProviderCode} />

      {isTariffUpdate ? (
        <>
          <Field label="Service Type" required>
            <select name="serviceType" required className={inputClass} defaultValue="CONSULTATION">
              {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <ServiceTariffFields providerCode={providerCode} />
        </>
      ) : (
        <ProviderManagementCategoryFields />
      )}

      <EnrolleeFields initial={initialEnrollee} required={isTariffUpdate} />

      {isTariffUpdate && (
        <Field label="Reason Provider Is Negotiating" required className="sm:col-span-2">
          <textarea
            name="reason"
            required
            rows={3}
            className={inputClass}
            placeholder="e.g. Provider says current tariff is below their cost for this procedure"
          />
        </Field>
      )}
    </>
  );
}

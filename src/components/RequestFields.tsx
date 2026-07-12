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
  const [pmCategories, setPmCategories] = useState<string[]>([]);
  const isTariffUpdate = caseType === "TARIFF_UPDATE";
  // A brand-new facility won't exist in Prognosis yet, so searching for it
  // there would never find anything — this is the one category where we
  // need a plain text facility name instead of the Prognosis provider
  // search, and we only know that once a category is picked, which is why
  // category selection comes before the provider field for this case type.
  const isNewFacility = pmCategories.includes("NEW_FACILITY_SIGN_ON");

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

      {isTariffUpdate ? (
        <>
          <ProviderFields initial={initialProvider} onProviderCodeChange={setProviderCode} />

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
        <>
          <ProviderManagementCategoryFields onCategoriesChange={setPmCategories} />

          {isNewFacility ? (
            <>
              <Field
                label="New Facility Name"
                required
                hint="Not yet in Prognosis — type the facility name as given by the enrollee"
                className="sm:col-span-2"
              >
                <input name="providerName" required className={inputClass} placeholder="e.g. Sunrise Diagnostic Centre" />
              </Field>
              <Field label="Facility Email" hint="Optional — if provided">
                <input name="providerEmail" type="email" className={inputClass} />
              </Field>
              <Field label="Facility Phone" hint="Optional — if provided">
                <input name="providerPhone" className={inputClass} />
              </Field>
            </>
          ) : (
            <ProviderFields initial={initialProvider} onProviderCodeChange={setProviderCode} />
          )}
        </>
      )}

      {isTariffUpdate && <EnrolleeFields initial={initialEnrollee} required />}

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

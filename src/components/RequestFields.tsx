"use client";

import { useRef, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { ProviderFields, type ProviderInitial } from "@/components/ProviderFields";
import { ServiceTariffFields } from "@/components/ServiceTariffFields";
import { EnrolleeFields, type EnrolleeInitial } from "@/components/EnrolleeFields";
import { ProviderManagementCategoryFields } from "@/components/ProviderManagementCategoryFields";
import { SERVICE_TYPE_LABELS, CASE_TYPE_LABELS } from "@/lib/domain";

type CaseType = "TARIFF_UPDATE" | "PROVIDER_MANAGEMENT";

/** One "Service N" box wrapping a ServiceTariffFields instance, with its own
 * remove control. Every service line submits the same field names
 * (requestedItem, serviceCode, currentTariff, etc.) — createCase zips them
 * across lines by position via formData.getAll(), so this component only
 * needs to control how many instances render, not how they're named. */
function ServiceLine({
  providerCode,
  index,
  canRemove,
  onRemove,
}: {
  providerCode: string;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-ink-200 p-4 sm:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Service {index + 1}</p>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ServiceTariffFields providerCode={providerCode} />
      </div>
    </div>
  );
}

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
  const [serviceLineIds, setServiceLineIds] = useState<number[]>([0]);
  const nextServiceLineId = useRef(1);
  const isTariffUpdate = caseType === "TARIFF_UPDATE";

  function addServiceLine() {
    setServiceLineIds((ids) => [...ids, nextServiceLineId.current++]);
  }
  function removeServiceLine(id: number) {
    setServiceLineIds((ids) => ids.filter((x) => x !== id));
  }
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

          {serviceLineIds.map((id, idx) => (
            <ServiceLine
              key={id}
              providerCode={providerCode}
              index={idx}
              canRemove={serviceLineIds.length > 1}
              onRemove={() => removeServiceLine(id)}
            />
          ))}
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={addServiceLine}
              className="rounded-lg border border-dashed border-ink-300 px-3.5 py-2 text-[12.5px] font-semibold text-ink-600 hover:border-ink-400 hover:bg-ink-100"
            >
              + Add Another Service
            </button>
          </div>
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

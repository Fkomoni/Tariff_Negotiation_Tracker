"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { ProviderFields, type ProviderInitial } from "@/components/ProviderFields";
import { ServiceTariffFields } from "@/components/ServiceTariffFields";
import { SERVICE_TYPE_LABELS } from "@/lib/domain";

export function ProviderAndServiceFields({ initialProvider }: { initialProvider?: ProviderInitial }) {
  const [providerCode, setProviderCode] = useState(initialProvider?.code ?? "");

  return (
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
  );
}

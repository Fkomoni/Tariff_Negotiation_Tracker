"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { ProviderFields } from "@/components/ProviderFields";
import { ServiceTariffFields } from "@/components/ServiceTariffFields";
import { SERVICE_TYPE_LABELS } from "@/lib/domain";

export function ProviderAndServiceFields() {
  const [providerCode, setProviderCode] = useState("");

  return (
    <>
      <ProviderFields onProviderCodeChange={setProviderCode} />

      <Field label="Service Type" required>
        <select name="serviceType" required className={inputClass} defaultValue="MEDICATION">
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

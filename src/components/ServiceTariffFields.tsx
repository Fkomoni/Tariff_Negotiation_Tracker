"use client";

import { useEffect, useRef, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { formatCurrency } from "@/lib/domain";

interface TariffResult {
  serviceCode: string;
  description: string;
  providerTariffCode: string | null;
  nomenclature: string | null;
  tariffName: string | null;
  minCost: number | null;
  maxCost: number | null;
  unitPrice: number | null;
}

interface TreatmentResult {
  procedureId: string;
  name: string;
}

type Mode = "existing" | "new";

export function ServiceTariffFields({ providerCode }: { providerCode: string }) {
  const [mode, setMode] = useState<Mode>("existing");

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TariffResult | null>(null);
  const [currentTariff, setCurrentTariff] = useState("");
  const [results, setResults] = useState<TariffResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchedNoMatch, setSearchedNoMatch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Compares values rather than consuming a one-shot flag, so this stays
  // correct even if React re-runs the effect more than once (e.g. Strict
  // Mode double-invocation in dev).
  const confirmedDescriptionRef = useRef("");

  const [treatmentQuery, setTreatmentQuery] = useState("");
  const [selectedTreatment, setSelectedTreatment] = useState<TreatmentResult | null>(null);
  const [newCurrentTariff, setNewCurrentTariff] = useState("");
  const [treatmentResults, setTreatmentResults] = useState<TreatmentResult[]>([]);
  const [treatmentTotalMatches, setTreatmentTotalMatches] = useState(0);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [treatmentLoading, setTreatmentLoading] = useState(false);
  const [treatmentSearchedNoMatch, setTreatmentSearchedNoMatch] = useState(false);
  const treatmentContainerRef = useRef<HTMLDivElement>(null);
  const confirmedTreatmentNameRef = useRef("");

  useEffect(() => {
    setSelected(null);
    setQuery("");
    setCurrentTariff("");
    setResults([]);
    setSearchedNoMatch(false);
    confirmedDescriptionRef.current = "";
  }, [providerCode]);

  useEffect(() => {
    if (mode !== "existing" || !providerCode) {
      setResults([]);
      return;
    }
    if (query === confirmedDescriptionRef.current) {
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      setSearchedNoMatch(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tariffs?providerCode=${encodeURIComponent(providerCode)}&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const found = data.results ?? [];
        setResults(found);
        setSearchedNoMatch(found.length === 0);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, mode, providerCode]);

  useEffect(() => {
    if (mode !== "new") {
      setTreatmentResults([]);
      return;
    }
    if (treatmentQuery === confirmedTreatmentNameRef.current) {
      return;
    }
    if (treatmentQuery.trim().length < 2) {
      setTreatmentResults([]);
      setTreatmentSearchedNoMatch(false);
      return;
    }
    const handle = setTimeout(async () => {
      setTreatmentLoading(true);
      try {
        const res = await fetch(`/api/treatments?q=${encodeURIComponent(treatmentQuery)}`);
        const data = await res.json();
        const found = data.results ?? [];
        setTreatmentResults(found);
        setTreatmentTotalMatches(data.totalMatches ?? found.length);
        setTreatmentSearchedNoMatch(found.length === 0);
        setTreatmentOpen(true);
      } catch {
        setTreatmentResults([]);
        setTreatmentTotalMatches(0);
      } finally {
        setTreatmentLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [treatmentQuery, mode]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (treatmentContainerRef.current && !treatmentContainerRef.current.contains(e.target as Node)) {
        setTreatmentOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectTariff(t: TariffResult) {
    confirmedDescriptionRef.current = t.description;
    setSelected(t);
    setQuery(t.description);
    setCurrentTariff(t.unitPrice !== null ? String(t.unitPrice) : "");
    setResults([]);
    setOpen(false);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setOpen(true);
    setSearchedNoMatch(false);
    if (selected && value !== selected.description) {
      setSelected(null);
      setCurrentTariff("");
    }
  }

  function selectTreatment(t: TreatmentResult) {
    confirmedTreatmentNameRef.current = t.name;
    setSelectedTreatment(t);
    setTreatmentQuery(t.name);
    setTreatmentResults([]);
    setTreatmentOpen(false);
  }

  function handleTreatmentQueryChange(value: string) {
    setTreatmentQuery(value);
    setTreatmentOpen(true);
    setTreatmentSearchedNoMatch(false);
    if (selectedTreatment && value !== selectedTreatment.name) {
      setSelectedTreatment(null);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSelected(null);
    setQuery("");
    setCurrentTariff("");
    setResults([]);
    setSearchedNoMatch(false);
    setSelectedTreatment(null);
    setTreatmentQuery("");
    setNewCurrentTariff("");
    setTreatmentResults([]);
    setTreatmentSearchedNoMatch(false);
    confirmedTreatmentNameRef.current = "";
  }

  return (
    <>
      <input type="hidden" name="requestType" value={mode === "new" ? "NEW_SERVICE" : "EXISTING_TARIFF_UPDATE"} />

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={() => switchMode("existing")}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
            mode === "existing" ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
          }`}
        >
          Update Existing Tariff Price
        </button>
        <button
          type="button"
          onClick={() => switchMode("new")}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
            mode === "new" ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
          }`}
        >
          Add New Service
        </button>
      </div>

      {mode === "existing" ? (
        <>
          <Field
            label="Requested Service / Item"
            required
            hint={!providerCode ? "Select a provider above first" : "Search the provider's existing tariff on file"}
            className="sm:col-span-2"
          >
            <div ref={containerRef} className="relative">
              <input
                name="requestedItem"
                required
                autoComplete="off"
                disabled={!providerCode}
                className={`${inputClass} disabled:cursor-not-allowed disabled:bg-ink-100`}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder={providerCode ? "e.g. Elective caesarean section" : ""}
              />
              <input type="hidden" name="serviceCode" value={selected?.serviceCode ?? ""} />
              <input type="hidden" name="providerTariffCode" value={selected?.providerTariffCode ?? ""} />
              {loading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">
                  Searching…
                </span>
              )}
              {open && results.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg">
                  {results.map((t, idx) => (
                    <button
                      key={`${t.serviceCode}-${idx}`}
                      type="button"
                      onClick={() => selectTariff(t)}
                      className="block w-full border-b border-ink-100 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-ink-100"
                    >
                      <p className="text-[13px] font-semibold text-ink-900">{t.description}</p>
                      <p className="text-[11px] text-ink-400">
                        {[t.serviceCode, t.tariffName].filter(Boolean).join(" · ") || " "}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        {t.minCost !== null || t.maxCost !== null
                          ? `${t.minCost !== null ? formatCurrency(t.minCost) : "—"} – ${
                              t.maxCost !== null ? formatCurrency(t.maxCost) : "—"
                            }`
                          : " "}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {!loading && searchedNoMatch && !selected && providerCode && (
                <p className="mt-1.5 text-[11px] text-ink-400">
                  No matching item on this provider&apos;s tariff — switch to &quot;Add New Service&quot; if it
                  genuinely isn&apos;t priced yet.
                </p>
              )}
            </div>
          </Field>

          <Field label="Current Tariff Amount (₦)" required hint="From Prognosis — editable">
            <input
              name="currentTariff"
              type="number"
              min="0"
              step="0.01"
              required
              className={inputClass}
              value={currentTariff}
              onChange={(e) => setCurrentTariff(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field
            label="Requested Service / Item"
            required
            hint="Search Prognosis's full treatment catalog — this service exists there, just not yet priced on this provider"
            className="sm:col-span-2"
          >
            <div ref={treatmentContainerRef} className="relative">
              <input
                name="requestedItem"
                required
                autoComplete="off"
                className={inputClass}
                value={treatmentQuery}
                onChange={(e) => handleTreatmentQueryChange(e.target.value)}
                onFocus={() => treatmentResults.length > 0 && setTreatmentOpen(true)}
                placeholder="e.g. Elective caesarean section"
              />
              <input type="hidden" name="serviceCode" value={selectedTreatment?.procedureId ?? ""} />
              {treatmentLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">
                  Searching…
                </span>
              )}
              {treatmentOpen && treatmentResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg">
                  {treatmentResults.map((t, idx) => (
                    <button
                      key={`${t.procedureId}-${idx}`}
                      type="button"
                      onClick={() => selectTreatment(t)}
                      className="block w-full border-b border-ink-100 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-ink-100"
                    >
                      <p className="text-[13px] font-semibold text-ink-900">{t.name}</p>
                      <p className="text-[11px] text-ink-400">{t.procedureId}</p>
                    </button>
                  ))}
                </div>
              )}
              {!treatmentLoading && treatmentSearchedNoMatch && !selectedTreatment && (
                <p className="mt-1.5 text-[11px] text-ink-400">
                  No matching procedure found in Prognosis's treatment catalog.
                </p>
              )}
              {!treatmentLoading && treatmentTotalMatches > treatmentResults.length && (
                <p className="mt-1.5 text-[11px] text-ink-400">
                  Showing {treatmentResults.length} of {treatmentTotalMatches} matches — keep typing to narrow it
                  down.
                </p>
              )}
            </div>
          </Field>

          <Field label="Current Tariff Amount (₦)" required hint="No existing price on this provider — enter what's being proposed">
            <input
              name="currentTariff"
              type="number"
              min="0"
              step="0.01"
              required
              className={inputClass}
              value={newCurrentTariff}
              onChange={(e) => setNewCurrentTariff(e.target.value)}
            />
          </Field>
        </>
      )}
    </>
  );
}

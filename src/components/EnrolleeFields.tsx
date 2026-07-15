"use client";

import { useEffect, useRef, useState } from "react";
import { Field, inputClass } from "@/components/ui";

interface EnrolleeResult {
  enrolleeId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  scheme: string | null;
  age: number | null;
  relationship: string | null;
}

export interface EnrolleeInitial {
  enrolleeId: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  scheme: string;
  age: string;
}

export function EnrolleeFields({ initial, required = true }: { initial?: EnrolleeInitial; required?: boolean }) {
  // "N/A" is the "no enrollee present" sentinel (see toggleNoEnrolleePresent
  // below) — a repeat-from-source case logged that way should reopen with
  // the toggle already on, not with "N/A" sitting in the search box as if
  // it were a real typed name.
  const initialIsNoEnrollee = initial?.fullName === "N/A";
  const [noEnrolleePresent, setNoEnrolleePresent] = useState(initialIsNoEnrollee);
  const [query, setQuery] = useState(!initialIsNoEnrollee ? initial?.fullName ?? "" : "");
  const [hasSelection, setHasSelection] = useState(!!initial?.fullName && !initialIsNoEnrollee);
  const [enrolleeId, setEnrolleeId] = useState(initial?.enrolleeId ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [scheme, setScheme] = useState(initial?.scheme ?? "");
  const [age, setAge] = useState(initial?.age ?? "");
  const [results, setResults] = useState<EnrolleeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchedNoMatch, setSearchedNoMatch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Compares values rather than consuming a one-shot flag, so this stays
  // correct even if React re-runs the effect more than once (e.g. Strict
  // Mode double-invocation in dev).
  const confirmedNameRef = useRef(!initialIsNoEnrollee ? initial?.fullName ?? "" : "");

  useEffect(() => {
    if (query === confirmedNameRef.current) {
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      setSearchedNoMatch(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/enrollees?q=${encodeURIComponent(query)}`);
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
    }, 400);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectEnrollee(r: EnrolleeResult) {
    confirmedNameRef.current = r.fullName;
    setHasSelection(true);
    setQuery(r.fullName);
    setEnrolleeId(r.enrolleeId ?? "");
    setEmail(r.email ?? "");
    setPhone(r.phone ?? "");
    setCompany(r.company ?? "");
    setScheme(r.scheme ?? "");
    setAge(r.age !== null ? String(r.age) : "");
    setResults([]);
    setOpen(false);
  }

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    setSearchedNoMatch(false);
    if (hasSelection) {
      setHasSelection(false);
      setEnrolleeId("");
      setEmail("");
      setPhone("");
      setCompany("");
      setScheme("");
      setAge("");
    }
  }

  function toggleNoEnrolleePresent() {
    setNoEnrolleePresent((prev) => {
      const next = !prev;
      if (next) {
        // Clear any partially-entered enrollee so it can't leak into the
        // submission alongside the "no enrollee" sentinel below.
        setQuery("");
        setHasSelection(false);
        setEnrolleeId("");
        setEmail("");
        setPhone("");
        setCompany("");
        setScheme("");
        setAge("");
        setResults([]);
      }
      return next;
    });
  }

  // "N/A" is the same sentinel already used for Provider Management requests
  // (which never have an enrollee) — the case-detail page and case list
  // already know to hide enrollee mentions for that value, so a "no
  // enrollee present" tariff case reads the same way with no extra display
  // logic needed.
  if (noEnrolleePresent) {
    return (
      <>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink-700">Enrollee</span>
            <button
              type="button"
              onClick={toggleNoEnrolleePresent}
              className="rounded-md bg-ink-900 px-2.5 py-1 text-[11.5px] font-semibold text-white"
            >
              No enrollee present
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-400">
            This request will be logged without an enrollee attached — the provider wants pricing updated directly.
          </p>
        </div>
        <input type="hidden" name="enrolleeName" value="N/A" />
        <input type="hidden" name="enrolleeId" value="" />
      </>
    );
  }

  return (
    <>
      <Field
        label="Enrollee"
        required={required}
        hint={required ? "Search by name, phone, email, or enrollee ID" : "Optional — search by name, phone, email, or enrollee ID"}
        className="sm:col-span-2"
      >
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={toggleNoEnrolleePresent}
            className="rounded-md bg-ink-100 px-2.5 py-1 text-[11.5px] font-semibold text-ink-600 hover:bg-ink-200"
          >
            No enrollee present
          </button>
        </div>
        <div ref={containerRef} className="relative">
          <input
            name="enrolleeName"
            required={required}
            autoComplete="off"
            className={inputClass}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="e.g. Favour Adekunle, 08012345678, or 21000645/0"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">
              Searching…
            </span>
          )}
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg">
              {results.map((r, idx) => (
                <button
                  key={`${r.enrolleeId}-${idx}`}
                  type="button"
                  onClick={() => selectEnrollee(r)}
                  className="block w-full border-b border-ink-100 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-ink-100"
                >
                  <p className="text-[13px] font-semibold text-ink-900">
                    {r.fullName}
                    {r.relationship && (
                      <span className="ml-1.5 font-normal text-ink-400">({r.relationship})</span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {[r.enrolleeId, r.company, r.scheme].filter(Boolean).join(" · ") || " "}
                  </p>
                  <p className="text-[11px] text-ink-400">{[r.phone, r.email].filter(Boolean).join(" · ") || " "}</p>
                </button>
              ))}
            </div>
          )}
          {!loading && searchedNoMatch && !hasSelection && (
            <p className="mt-1.5 text-[11px] text-ink-400">
              No match found in Prognosis — you can still log this case with the name typed above.
            </p>
          )}
        </div>
      </Field>

      <input type="hidden" name="enrolleeId" value={enrolleeId} />

      {hasSelection && (
        <>
          <Field label="Enrollee Email" hint="From Prognosis — editable">
            <input
              name="enrolleeEmail"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Enrollee Phone" hint="From Prognosis — editable">
            <input name="enrolleePhone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <Field label="Company" hint="From Prognosis — editable">
            <input
              name="enrolleeCompany"
              className={inputClass}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </Field>

          <Field label="Scheme" hint="From Prognosis — editable">
            <input name="enrolleeScheme" className={inputClass} value={scheme} onChange={(e) => setScheme(e.target.value)} />
          </Field>

          <Field label="Age" hint="From Prognosis — editable">
            <input
              name="enrolleeAge"
              type="number"
              min="0"
              className={inputClass}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </Field>
        </>
      )}
    </>
  );
}

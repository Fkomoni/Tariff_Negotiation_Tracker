"use client";

import { useEffect, useRef, useState } from "react";
import { Field, inputClass } from "@/components/ui";

interface ProviderResult {
  code: string;
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  scheme: string | null;
  specialty: string | null;
  status: string | null;
}

export function ProviderFields({ onProviderCodeChange }: { onProviderCodeChange?: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProviderResult | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<ProviderResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipSearchRef = useRef(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/providers?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
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

  function selectProvider(p: ProviderResult) {
    skipSearchRef.current = true;
    setSelected(p);
    setQuery(p.name);
    setEmail(p.email ?? "");
    setPhone(p.phone ?? "");
    setResults([]);
    setOpen(false);
    onProviderCodeChange?.(p.code);
  }

  function handleNameChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (selected && value !== selected.name) {
      setSelected(null);
      setEmail("");
      setPhone("");
      onProviderCodeChange?.("");
    }
  }

  return (
    <>
      <Field label="Provider / Hospital Name" required className="sm:col-span-2">
        <div ref={containerRef} className="relative">
          <input
            name="providerName"
            required
            autoComplete="off"
            className={inputClass}
            value={query}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Start typing to search providers…"
          />
          <input type="hidden" name="providerCode" value={selected?.code ?? ""} />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">
              Searching…
            </span>
          )}
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg">
              {results.map((p) => (
                <button
                  key={`${p.code}-${p.id}`}
                  type="button"
                  onClick={() => selectProvider(p)}
                  className="block w-full border-b border-ink-100 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-ink-100"
                >
                  <p className="text-[13px] font-semibold text-ink-900">{p.name}</p>
                  <p className="text-[11px] text-ink-400">
                    {[p.scheme, p.address].filter(Boolean).join(" · ") || " "}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {[p.phone, p.email].filter(Boolean).join(" · ") || " "}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      {selected && (
        <>
          <Field label="Provider Email" hint="From Prognosis — editable">
            <input
              name="providerEmail"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Provider Phone" hint="From Prognosis — editable">
            <input
              name="providerPhone"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </>
      )}
    </>
  );
}

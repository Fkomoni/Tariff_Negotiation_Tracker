"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";
import { PM_CATEGORY_GROUPS, PM_CATEGORY_LABELS, PM_CATEGORIES_REQUIRING_ATTACHMENT } from "@/lib/domain";

export function ProviderManagementCategoryFields() {
  const [selected, setSelected] = useState<string[]>([]);

  const needsAttachment = selected.some((c) => PM_CATEGORIES_REQUIRING_ATTACHMENT.includes(c as never));

  function toggle(category: string) {
    setSelected((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  }

  return (
    <div className="sm:col-span-2 space-y-5">
      <div>
        <span className="mb-2 block text-[12.5px] font-semibold text-ink-700">
          What is this request about? <span className="text-brand">*</span>
        </span>
        <span className="mb-3 block text-[11px] text-ink-400">Select all that apply</span>
        <div className="space-y-4">
          {PM_CATEGORY_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{group.group}</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.categories.map((category) => (
                  <label
                    key={category}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
                      selected.includes(category) ? "border-brand bg-brand-50 text-brand-700" : "border-ink-200 text-ink-700 hover:bg-ink-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="pmCategories"
                      value={category}
                      checked={selected.includes(category)}
                      onChange={() => toggle(category)}
                      className="mt-0.5"
                    />
                    {PM_CATEGORY_LABELS[category as keyof typeof PM_CATEGORY_LABELS]}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {selected.length === 0 && (
          <p className="mt-2 text-[11px] text-ink-400">Pick at least one category above.</p>
        )}
      </div>

      {needsAttachment && (
        <div>
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
            Bank Details Letterhead <span className="text-brand">*</span>
          </span>
          <input
            type="file"
            name="pmAttachment"
            required
            accept=".pdf,.png,.jpg,.jpeg"
            className="block w-full text-[12.5px] text-ink-700 file:mr-3 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            Required for a bank information update — PDF or image of the provider's bank letterhead.
          </span>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
          Details for Provider Management <span className="text-brand">*</span>
        </span>
        <textarea
          name="reason"
          required
          rows={4}
          className={inputClass}
          placeholder="Paste or type everything Provider Management needs to action this — dates, reference numbers, who to contact, etc."
        />
      </label>
    </div>
  );
}

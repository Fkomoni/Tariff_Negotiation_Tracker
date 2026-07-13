// Exported fields like providerName/requestedItem/approvalReason can carry
// free-typed staff input (the UI explicitly allows logging a case with a
// name that didn't match Prognosis, or a free-typed new-service name). A
// value starting with one of these triggers a formula in Excel/Sheets when
// the export is later opened — prefixing with an apostrophe forces it to be
// read as plain text instead. Per OWASP's CSV Injection guidance.
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/;

function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_TRIGGER_CHARS.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n");
}

import ExcelJS from "exceljs";

export interface Sheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
  /** Column indexes (0-based) to format as currency. */
  currencyColumns?: number[];
}

/**
 * Writes a real .xlsx workbook.
 *
 * Deliberately a genuine spreadsheet rather than a CSV with the extension
 * changed: Excel shows a "the file format doesn't match" warning for that, and
 * the numbers arrive as text, so nobody can sum or pivot them without
 * re-typing. Here numbers stay numbers and currency columns carry a naira
 * format, which is the entire point of offering Excel next to CSV.
 *
 * Note on CSV safety: the formula-injection escaping in lib/csv.ts is not
 * needed here. That guard exists because a spreadsheet interprets a leading
 * "=" in a *text* field of a CSV; in xlsx a string cell is typed as a string
 * and is never evaluated.
 */
export async function buildWorkbook(sheets: Sheet[], meta: { title: string; description: string }): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Leadway Health · Provider Tariff Negotiation Tracker";
  wb.created = new Date();

  for (const sheet of sheets) {
    // Excel rejects / \ ? * [ ] : in sheet names and caps them at 31 chars.
    const ws = wb.addWorksheet(sheet.name.replace(/[/\\?*[\]:]/g, "-").slice(0, 31));

    // A downloaded file should say what it covers — without this, a filtered
    // export is indistinguishable from a full one once it's off the screen.
    const titleRow = ws.addRow([meta.title]);
    titleRow.font = { bold: true, size: 13 };
    const descRow = ws.addRow([meta.description]);
    descRow.font = { size: 10, color: { argb: "FF666666" } };
    ws.addRow([]);

    const header = ws.addRow(sheet.columns);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    for (const row of sheet.rows) ws.addRow(row);

    const currency = new Set(sheet.currencyColumns ?? []);
    sheet.columns.forEach((col, i) => {
      const column = ws.getColumn(i + 1);
      // Width from the widest value, clamped so one long provider name doesn't
      // produce a column nobody can see past.
      const longest = Math.max(col.length, ...sheet.rows.map((r) => String(r[i] ?? "").length));
      column.width = Math.min(Math.max(longest + 2, 10), 46);
      if (currency.has(i)) column.numFmt = '₦#,##0.00';
    });

    // Freeze the header so scrolling a long export keeps its column names.
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + sheet.rows.length, column: sheet.columns.length },
    };
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

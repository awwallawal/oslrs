/**
 * XLSX parser (Story 11-2).
 *
 * Reads the FIRST worksheet, treats row 1 as the header, and builds a record
 * per data row keyed by header. Handles exceljs's rich cell-value shapes
 * (rich text, hyperlink, formula results) by coercing to a display string.
 * Blank rows are skipped; Unicode is preserved.
 *
 * Multi-sheet workbooks: only the first sheet is ingested (the reference and
 * association sheets are single-data-sheet). If more sheets exist, a
 * `detectedColumns` note is not the place to flag it — the caller logs the
 * sheet count; secondary sheets (e.g. an XLSForm `choices` sheet) are ignored
 * by design.
 */

import ExcelJS from 'exceljs';
import { buildParsedRow } from '../normalise-row.js';
import type { ParseResult, ParserInput, ParsedRow, ParseFailure } from './types.js';

/** Coerce an exceljs cell value (which may be an object) to a display string. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) {
    // Excel dates → ISO date (the date normaliser fast-paths ISO).
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    // Formula cell → use computed result.
    if ('result' in v && v.result != null) return String(v.result);
    // Hyperlink cell → prefer the visible text.
    if ('text' in v && v.text != null) return String(v.text);
    // Rich text → concatenate runs.
    if ('richText' in v && Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
    }
    if ('hyperlink' in v && v.hyperlink != null) return String(v.hyperlink);
  }
  return String(value);
}

export async function parseXlsx({ buffer, columnMapping }: ParserInput): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs types want an ArrayBuffer-ish; a Node Buffer works at runtime.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (err) {
    throw new Error(`XLSX parse failed: ${(err as Error).message}`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('XLSX parse failed: workbook has no worksheets');
  }

  // Header row = first row. Build a column-number -> header map.
  const headerByCol = new Map<number, string>();
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = cellToString(cell.value).trim();
    if (header !== '') headerByCol.set(colNumber, header);
  });

  const rows: ParsedRow[] = [];
  const failures: ParseFailure[] = [];

  const lastRow = worksheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const rec: Record<string, string> = {};
    let hasValue = false;
    for (const [colNumber, header] of headerByCol) {
      const str = cellToString(row.getCell(colNumber).value).trim();
      rec[header] = str;
      if (str !== '') hasValue = true;
    }
    if (!hasValue) continue; // skip blank rows

    // dataIndex is 0-based over data rows (rowNumber 2 -> index 0).
    const dataIndex = rowNumber - 2;
    try {
      rows.push(buildParsedRow(dataIndex, rec, columnMapping));
    } catch (err) {
      failures.push({ rowIndex: dataIndex, reason: (err as Error).message, raw: rec });
    }
  }

  return { rows, failures, detectedColumns: columnMapping };
}

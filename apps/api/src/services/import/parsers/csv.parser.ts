/**
 * CSV parser (Story 11-2).
 *
 * Header-row keyed parse via `csv-parse` (sync API — files are ≤10MB so the
 * whole-buffer parse is well within the 30s dry-run budget). BOM-stripped,
 * whitespace-trimmed, blank rows skipped. `relax_column_count` tolerates ragged
 * rows (short/long) rather than aborting the whole file.
 */

import { parse } from 'csv-parse/sync';
import { buildParsedRow } from '../normalise-row.js';
import type { ParseResult, ParserInput, ParsedRow, ParseFailure } from './types.js';

export async function parseCsv({ buffer, columnMapping }: ParserInput): Promise<ParseResult> {
  const text = buffer.toString('utf8');

  let records: Record<string, unknown>[];
  try {
    records = parse(text, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, unknown>[];
  } catch (err) {
    // Whole-file failure (malformed quoting etc.) — surface to the caller,
    // which converts it to an AppError. A single unparseable file is not a
    // per-row failure; the operator must fix + re-upload.
    throw new Error(`CSV parse failed: ${(err as Error).message}`);
  }

  const rows: ParsedRow[] = [];
  const failures: ParseFailure[] = [];

  records.forEach((rec, i) => {
    const hasValue = Object.values(rec).some((v) => String(v ?? '').trim() !== '');
    if (!hasValue) return; // skip fully-blank rows
    try {
      rows.push(buildParsedRow(i, rec, columnMapping));
    } catch (err) {
      failures.push({ rowIndex: i, reason: (err as Error).message, raw: rec });
    }
  });

  return { rows, failures, detectedColumns: columnMapping };
}

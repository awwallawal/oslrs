/**
 * Shared parser contract (Story 11-2).
 *
 * All three parsers (pdf_tabular, csv, xlsx) return the SAME `ParseResult`
 * shape so the import service can treat them interchangeably. A parser's job:
 *   1. Read the file into tabular rows keyed by source header.
 *   2. Apply the per-source `ColumnMapping` (sourceHeader -> canonicalField).
 *   3. Normalise known canonical fields via the prep-input-sanitisation layer.
 *   4. Emit `{ rows, failures, detectedColumns }`.
 *
 * The parser does NOT enforce required fields, consent, dedup, or LGA
 * resolution — those are the import service's job at confirm time. The parser
 * only shapes + normalises. Rows it genuinely cannot read become `failures`;
 * rows it reads but that carry warnings (e.g. odd phone format) are still
 * emitted with the warning codes attached.
 */

/**
 * Canonical respondent-ingest field names. A `ColumnMapping` maps each source
 * header to one of these. `fullName` is split into first/last by the service
 * when the source has a single name column (e.g. ITF-SUPA "Name").
 *
 * NOTE: `email` is captured for provenance but the `respondents` table has NO
 * email column (verified 2026-07-20) — it is preserved in
 * `respondents.metadata.imported_email` and is NOT a dedup key. Dedup is on
 * `phoneNumber` OR `nin` (the columns that exist and are indexed).
 */
export const CANONICAL_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'phoneNumber',
  'nin',
  'lgaId',
  'dateOfBirth',
  'ageYears',
  'email',
  'profession',
  'experienceLevel',
  'gender',
  'town',
  'consent',
  'externalReferenceId',
] as const;
export type CanonicalField = typeof CANONICAL_FIELDS[number];

/** sourceHeader -> canonicalField. Headers not present here are ignored. */
export type ColumnMapping = Record<string, CanonicalField>;

export interface ParsedRow {
  /** 0-based index of the row within the source file's data rows. */
  rowIndex: number;
  /** canonicalField -> normalised value. Absent keys were not present/empty. */
  canonical: Partial<Record<CanonicalField, string>>;
  /** original source cells keyed by source header (pre-normalisation). */
  raw: Record<string, string>;
  /** normalisation warning codes accumulated across all fields of this row. */
  warnings: string[];
}

export interface ParseFailure {
  rowIndex: number;
  reason: string;
  /** best-effort raw payload of the offending row (never contains a stack). */
  raw?: unknown;
}

export interface ParseResult {
  rows: ParsedRow[];
  failures: ParseFailure[];
  /** sourceHeader -> canonicalField mapping actually applied. */
  detectedColumns: ColumnMapping;
}

export interface ParserInput {
  buffer: Buffer;
  /** resolved per-source mapping (from import-sources config or admin-supplied). */
  columnMapping: ColumnMapping;
  /**
   * PDF-only: some tabular PDFs cannot expose reliable header text, so the
   * caller may supply the ordered list of source headers matching the column
   * order. Ignored by csv/xlsx (which read the header row).
   */
  orderedHeaders?: string[];
}

export type ParserFn = (input: ParserInput) => Promise<ParseResult>;

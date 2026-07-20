/**
 * Per-source import configuration (Story 11-2).
 *
 * The single registry of how each secondary-data `source` maps its columns to
 * canonical respondent fields, plus which parser it defaults to. Adding a new
 * source (NBS, NIMC, or Story 13-2's `imported_association`) means adding an
 * entry HERE — no changes elsewhere in the import service.
 *
 * `imported_other` is the escape hatch: it carries no fixed mapping and accepts
 * an admin-supplied `column_mapping` at upload time.
 *
 * This is application config (not a Drizzle schema file), so importing the
 * canonical `respondentSourceTypes` from the schema is allowed.
 */

import { respondentSourceTypes } from '../db/schema/respondents.js';
import type { ColumnMapping } from '../services/import/parsers/types.js';

export type ImportParser = 'pdf_tabular' | 'csv' | 'xlsx';
export const IMPORT_PARSERS: readonly ImportParser[] = ['pdf_tabular', 'csv', 'xlsx'];

/** Sources that may be targeted by the import service (excludes field sources). */
export const IMPORTABLE_SOURCES = respondentSourceTypes.filter((s) => s.startsWith('imported_'));
export type ImportableSource = typeof IMPORTABLE_SOURCES[number];

export interface ImportSourceConfig {
  source: ImportableSource;
  label: string;
  /** Parser suggested in the UI; the operator still chooses explicitly. */
  defaultParser: ImportParser;
  /** Fixed sourceHeader -> canonicalField mapping (empty for admin-supplied). */
  columnMapping: ColumnMapping;
  /** When true, the operator supplies `column_mapping` at upload time. */
  allowAdminMapping: boolean;
  /** Lawful-basis default suggested for this source (operator can override). */
  defaultLawfulBasis: string;
}

/**
 * ITF-SUPA Oyo public-artisan register — the reference implementation.
 * Real column headers (verified against the published `Oyo_shortlisted_artisans.pdf`,
 * 3,675 rows): `S/N`, `ADM NO`, `FULL NAME`, `E-MAIL`, `PHONE NUMBER`, `ROLE`,
 * `STATE OF RESIDENCE`, `LGA OF RESIDENCE`, `TRADE AREAS`. `S/N` / `ROLE` /
 * `STATE OF RESIDENCE` carry no canonical target (sheet-only / constant).
 * `FULL NAME` is a single column → split into first/last by the service.
 *
 * ⚠️ The published *shortlist* PDF has REDACTED phone numbers (masked with
 * asterisks), so it is not directly import-viable (phone is the mandatory dedup
 * key). Production import needs the unmasked register (an XLSX/CSV export is the
 * clean path; the PDF parser is the fallback when only a PDF exists).
 */
const ITF_SUPA_CONFIG: ImportSourceConfig = {
  source: 'imported_itf_supa',
  label: 'ITF-SUPA Oyo Public Artisan Register',
  defaultParser: 'pdf_tabular',
  columnMapping: {
    'ADM NO': 'externalReferenceId',
    'FULL NAME': 'fullName',
    'E-MAIL': 'email',
    'PHONE NUMBER': 'phoneNumber',
    'LGA OF RESIDENCE': 'lgaId',
    'TRADE AREAS': 'profession',
  },
  allowAdminMapping: false,
  // Public labour registry — public-task basis (NDPA Art. 6(1)(e)).
  defaultLawfulBasis: 'ndpa_6_1_e',
};

const OTHER_CONFIG: ImportSourceConfig = {
  source: 'imported_other',
  label: 'Other MDA / Secondary Source',
  defaultParser: 'csv',
  columnMapping: {},
  allowAdminMapping: true,
  defaultLawfulBasis: 'ndpa_6_1_e',
};

const REGISTRY: Partial<Record<ImportableSource, ImportSourceConfig>> = {
  imported_itf_supa: ITF_SUPA_CONFIG,
  imported_other: OTHER_CONFIG,
  // imported_association is registered by Story 13-2 (association importer).
};

/** Returns the config for an importable source, or undefined if unknown. */
export function getImportSourceConfig(source: string): ImportSourceConfig | undefined {
  return REGISTRY[source as ImportableSource];
}

/** True if `source` is a configured, importable source. */
export function isImportableSource(source: string): boolean {
  return getImportSourceConfig(source) !== undefined;
}

/**
 * Resolve the effective column mapping for a dry-run: the source's fixed
 * mapping, or the admin-supplied mapping when the source allows it. Throws a
 * descriptive Error (caller wraps in AppError) when a mapping cannot be
 * resolved.
 */
export function resolveColumnMapping(
  source: string,
  adminMapping?: ColumnMapping | null,
): ColumnMapping {
  const config = getImportSourceConfig(source);
  if (!config) {
    throw new Error(`Unknown import source: ${source}`);
  }
  if (config.allowAdminMapping) {
    if (!adminMapping || Object.keys(adminMapping).length === 0) {
      throw new Error(`Source ${source} requires an admin-supplied column_mapping`);
    }
    return adminMapping;
  }
  return config.columnMapping;
}

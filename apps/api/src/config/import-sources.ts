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

/**
 * Association intake (Story 13-2) — the WhatsApp/coordinator route.
 *
 * ── Where these headers come from (do not invent them) ───────────────────────
 * The keys below are the twelve columns of the FROZEN Association Data Sheet,
 * `docs/launch-campaign/association-data-sheet-PRINT.html`, which is the paper
 * artefact coordinators actually fill and then transcribe. That sheet is the
 * contract; this mapping is its machine-readable half. If the sheet changes, this
 * changes in the SAME commit — a mapping that has drifted from the form silently
 * drops whole columns, because `buildParsedRow` matches headers EXACTLY (after a
 * trim) and an unmatched header is preserved in `raw` but never becomes canonical.
 *
 * ⚠️ `S/N` is deliberately unmapped — it is a sheet-local row counter, not an
 * external identifier, and mapping it to `externalReferenceId` would mint a fake
 * cross-batch key that collides on every new sheet (every sheet has a row 1).
 *
 * ⚠️ TRANSCRIPTION VARIANTS. The print sheet renders `Gender (M/F)` across two
 * lines; a coordinator typing it into Excel may produce the flat header, the
 * parenthetical, or neither. Header matching is exact, so the realistic spellings
 * are listed explicitly rather than hoped for. Many-to-one is legal here
 * (`ColumnMapping` is `Record<string, CanonicalField>`) and is the honest way to
 * absorb human transcription without loosening the matcher for every source.
 *
 * ⚠️ KNOWN LOSS — `Date of birth (or Age)` is ONE column offering TWO different
 * facts, and a mapping is one header to one canonical field. It maps to
 * `dateOfBirth`; a respondent who wrote a bare age (`34`) fails `normaliseDate`,
 * earns a `dateOfBirth:` warning, and their age is DROPPED rather than landing in
 * `ageYears`. This is a defect in the sheet's design, not the parser's — and it is
 * live for the association intake, where ages are commoner than birth dates. See
 * residual R-A1 on 13-2. It is NOT silently swallowed: the row still imports and
 * the warning is attributed, so the loss is countable in the batch preview.
 *
 * Consent: Awwal's ruling (2026-08-24) — association submissions are consented by
 * construction. The data was volunteered to the association FOR the registry, and
 * the association is aware of the use; there is no "unknown" tier to hide behind.
 * The column is still mapped, so an explicit `No` on the sheet is honoured.
 */
const ASSOCIATION_CONFIG: ImportSourceConfig = {
  source: 'imported_association',
  label: 'Trade Association Intake (coordinator sheet)',
  defaultParser: 'xlsx',
  columnMapping: {
    // Canonical spellings — exactly as the frozen print sheet renders them.
    'Surname': 'lastName',
    'First name': 'firstName',
    'Phone number': 'phoneNumber',
    'Gender (M/F)': 'gender',
    'Date of birth (or Age)': 'dateOfBirth',
    'LGA (work/live)': 'lgaId',
    'Town / Ward': 'town',
    'Trade / primary skill': 'profession',
    'Years exp.': 'experienceLevel',
    'NIN (if to hand)': 'nin',
    'Consent (Yes/No)': 'consent',
    /*
     * ⭐ SINGLE-COLUMN NAME (added 2026-09-05). The frozen PAPER sheet has two name
     * columns, and a coordinator filling it by hand produces two. But a
     * MACHINE-PREPARED extract routinely carries one — the NCARES agricultural
     * register is exactly that shape, 6,516 rows whose only name field is
     * `Full Name`. Without this key those 5,301 importable people would arrive
     * NAMELESS: the column is present in the file, unmapped, and therefore
     * silently ignored (headers are matched exactly; an unmatched one is kept in
     * `raw` and never becomes canonical). Caught by reading a dry-run's sample row
     * and noticing it had no name — Awwal went to the source and confirmed the
     * column was there all along.
     *
     * `ingest-plan`'s `splitName` PREFERS explicit first/last when present, so a
     * sheet carrying both spellings is unambiguous: the L-PRES rows use their own
     * Surname/First name, the NCARES rows fall back to this. ITF-SUPA already maps
     * `FULL NAME` the same way, so this adopts an existing shape rather than
     * inventing one.
     *
     * ⚠️ NAME ORDER IS NOT GUARANTEED, and this is the honest trade. `splitName`
     * takes the first token as the given name and the rest as the surname, while
     * the consolidation flagged every NCARES row `name_order_unreliable = YES` —
     * Yoruba registers are inconsistent about which comes first. Some will land
     * inverted. That is still far better than nameless, and it is RECOVERABLE:
     * `EXTRA_FIELDS` preserves the verbatim original in
     * `metadata.import_extra.full_name`, so the true string survives the split and
     * a later pass can re-derive it. Tracked as 13-2 R-A6.
     */
    'Full Name': 'fullName',
    'Full name': 'fullName',
    // Transcription variants — the parenthetical dropped, or spacing normalised.
    'First Name': 'firstName',
    'Phone Number': 'phoneNumber',
    'Gender': 'gender',
    'Date of birth': 'dateOfBirth',
    'LGA': 'lgaId',
    'Town': 'town',
    'Town / ward': 'town',
    'Trade / Primary skill': 'profession',
    'Trade': 'profession',
    'Years exp': 'experienceLevel',
    'Years experience': 'experienceLevel',
    'NIN': 'nin',
    'Consent': 'consent',
  },
  allowAdminMapping: false,
  // Public labour registry — public-task basis (NDPA Art. 6(1)(e)), as ITF-SUPA.
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
  imported_association: ASSOCIATION_CONFIG,
  imported_other: OTHER_CONFIG,
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

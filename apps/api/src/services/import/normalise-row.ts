/**
 * Shared row normalisation (Story 11-2).
 *
 * Turns a raw tabular record (sourceHeader -> cell) plus a `ColumnMapping` into
 * a canonical `ParsedRow`, routing each mapped field through the
 * prep-input-sanitisation layer (phone / name / trade / date / email). Used by
 * all three parsers so normalisation cannot drift per-format.
 *
 * Warnings are prefixed with the canonical field name (`phoneNumber:wrong_length…`)
 * so the batch failure/preview and the audit-log viewer can attribute them.
 */

import {
  normaliseNigerianPhone,
  normaliseFullName,
  normaliseTrade,
  normaliseDate,
  normaliseEmail,
} from '../../lib/normalise/index.js';
import type { CanonicalField, ColumnMapping, ParsedRow } from './parsers/types.js';

/** Format a JS Date as UTC `YYYY-MM-DD` for the text `date_of_birth` column. */
function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Digits-only NIN (strip spaces/dashes). Length validation happens at confirm. */
function cleanNin(raw: string): { value: string; warnings: string[] } {
  const digits = raw.replace(/\D/g, '');
  const warnings: string[] = [];
  if (digits.length !== 11) warnings.push(`wrong_length:expected_11_got_${digits.length}`);
  return { value: digits, warnings };
}

/**
 * Build a canonical ParsedRow from a raw record + mapping.
 *
 * `rawRecord` keys are source headers; values are cell strings (any type is
 * coerced + trimmed). Unmapped headers are preserved in `raw` but never
 * produce a canonical value.
 */
export function buildParsedRow(
  rowIndex: number,
  rawRecord: Record<string, unknown>,
  mapping: ColumnMapping,
): ParsedRow {
  const canonical: Partial<Record<CanonicalField, string>> = {};
  const raw: Record<string, string> = {};
  const warnings: string[] = [];

  const pushWarnings = (field: CanonicalField, codes: string[]) => {
    for (const c of codes) warnings.push(`${field}:${c}`);
  };

  for (const [header, rawValue] of Object.entries(rawRecord)) {
    const str = rawValue == null ? '' : String(rawValue).trim();
    raw[header] = str;

    const field = mapping[header];
    if (!field || str === '') continue;

    switch (field) {
      case 'phoneNumber': {
        const r = normaliseNigerianPhone(str);
        canonical.phoneNumber = r.value;
        pushWarnings(field, r.warnings);
        break;
      }
      case 'fullName':
      case 'firstName':
      case 'lastName': {
        const r = normaliseFullName(str);
        canonical[field] = r.value;
        // `single_word` is expected + noisy for firstName/lastName columns —
        // only surface it for the combined fullName field.
        pushWarnings(field, field === 'fullName' ? r.warnings : r.warnings.filter((w) => w !== 'single_word'));
        break;
      }
      case 'profession': {
        const r = normaliseTrade(str);
        canonical.profession = r.value;
        pushWarnings(field, r.warnings);
        break;
      }
      case 'dateOfBirth': {
        const r = normaliseDate(str);
        if (r.value) {
          canonical.dateOfBirth = toIsoDate(r.value);
        }
        pushWarnings(field, r.warnings);
        break;
      }
      case 'email': {
        const r = normaliseEmail(str);
        canonical.email = r.value;
        pushWarnings(field, r.warnings);
        break;
      }
      case 'nin': {
        const r = cleanNin(str);
        canonical.nin = r.value;
        pushWarnings(field, r.warnings);
        break;
      }
      default: {
        // lgaId, gender, town, ageYears, experienceLevel, consent,
        // externalReferenceId — stored trimmed-verbatim; the service resolves /
        // validates them (LGA lookup, consent Yes/No, age→dob, etc.).
        canonical[field] = str;
        break;
      }
    }
  }

  return { rowIndex, canonical, raw, warnings };
}

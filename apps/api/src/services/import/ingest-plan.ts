/**
 * Ingest planning (Story 11-2) — PURE, no DB.
 *
 * Given the parsed+normalised rows and the set of phones/NINs that already
 * exist in the registry, decides each row's disposition WITHOUT touching the
 * database, so the whole required-field / consent / dedup policy is unit-tested
 * in isolation. The service supplies the "existing" sets via a single batched
 * query and then just executes this plan (insert the winners, count the rest).
 *
 * Disposition precedence (first match wins):
 *   1. failed  — phone missing/invalid (can't dedup or re-contact → row lost)
 *   2. skipped — consent column present AND not "yes" (No/blank NOT entered)
 *   3. matched — phone or NIN already exists (in the batch OR in the registry)
 *   4. insert  — everything else
 *
 * Dedup is on phone OR NIN only (the columns that exist + are indexed on
 * `respondents`). Email is preserved as provenance, never a dedup key.
 */

import { createHash } from 'node:crypto';
import type { ParsedRow } from './parsers/types.js';

const VALID_PHONE = /^\+234\d{10}$/;
const VALID_NIN = /^\d{11}$/;
const CONSENT_YES = new Set(['yes', 'y', 'true', '1']);

/** Fields the service will insert into `respondents` for one row. */
export interface IngestRespondent {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  nin: string | null;
  lgaId: string | null;
  dateOfBirth: string | null;
  consentMarketplace: boolean;
  externalReferenceId: string | null;
  metadata: {
    normalisation_warnings?: string[];
    imported_email?: string;
    import_extra?: Record<string, string>;
  };
}

export interface IngestCandidate {
  rowIndex: number;
  respondent: IngestRespondent;
}

export interface IngestDisposition {
  rowIndex: number;
  category: 'matched' | 'skipped' | 'failed';
  reason: string;
  /** SHA-256 of the matched respondent id (avoids PII cross-link in the report). */
  matchedRespondentIdHash?: string;
}

export interface IngestPlan {
  toInsert: IngestCandidate[];
  dispositions: IngestDisposition[];
}

export interface PlanInput {
  rows: ParsedRow[];
  /** True when the source's column mapping includes a `consent` field. */
  hasConsentColumn: boolean;
  existingIdByPhone: Map<string, string>;
  existingIdByNin: Map<string, string>;
  /** raw LGA text -> { code|null, warning? }. Pure; supplied by the service. */
  resolveLga: (raw: string) => { code: string | null; warning?: string };
}

const EXTRA_FIELDS: Array<[keyof ParsedRow['canonical'], string]> = [
  ['fullName', 'full_name'],
  ['profession', 'profession'],
  ['gender', 'gender'],
  ['town', 'town'],
  ['ageYears', 'age_years'],
  ['experienceLevel', 'experience_level'],
];

function splitName(row: ParsedRow): { firstName: string | null; lastName: string | null } {
  const first = row.canonical.firstName;
  const last = row.canonical.lastName;
  if (first || last) return { firstName: first ?? null, lastName: last ?? null };

  const full = row.canonical.fullName;
  if (!full) return { firstName: null, lastName: null };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

export function planIngest(input: PlanInput): IngestPlan {
  const { rows, hasConsentColumn, existingIdByPhone, existingIdByNin, resolveLga } = input;

  const toInsert: IngestCandidate[] = [];
  const dispositions: IngestDisposition[] = [];
  const seenPhones = new Set<string>();
  const seenNins = new Set<string>();

  for (const row of rows) {
    const phone = row.canonical.phoneNumber ?? '';

    // 1. Required phone.
    if (!VALID_PHONE.test(phone)) {
      dispositions.push({ rowIndex: row.rowIndex, category: 'failed', reason: 'missing_or_invalid_phone' });
      continue;
    }

    // 2. Consent (only gates when the source carries a consent column).
    if (hasConsentColumn) {
      const consent = (row.canonical.consent ?? '').trim().toLowerCase();
      if (!CONSENT_YES.has(consent)) {
        dispositions.push({ rowIndex: row.rowIndex, category: 'skipped', reason: 'consent_not_given' });
        continue;
      }
    }

    const ninRaw = row.canonical.nin ?? '';
    const nin = VALID_NIN.test(ninRaw) ? ninRaw : null;

    // 3. Dedup — batch-local first, then registry.
    if (seenPhones.has(phone)) {
      dispositions.push({ rowIndex: row.rowIndex, category: 'matched', reason: 'phone_match_in_batch' });
      continue;
    }
    if (nin && seenNins.has(nin)) {
      dispositions.push({ rowIndex: row.rowIndex, category: 'matched', reason: 'nin_match_in_batch' });
      continue;
    }
    const existingByPhone = existingIdByPhone.get(phone);
    if (existingByPhone) {
      dispositions.push({
        rowIndex: row.rowIndex,
        category: 'matched',
        reason: 'phone_match',
        matchedRespondentIdHash: hashId(existingByPhone),
      });
      continue;
    }
    const existingByNin = nin ? existingIdByNin.get(nin) : undefined;
    if (existingByNin) {
      dispositions.push({
        rowIndex: row.rowIndex,
        category: 'matched',
        reason: 'nin_match',
        matchedRespondentIdHash: hashId(existingByNin),
      });
      continue;
    }

    // 4. Insert.
    seenPhones.add(phone);
    if (nin) seenNins.add(nin);

    const { firstName, lastName } = splitName(row);

    const warnings = [...row.warnings];
    let lgaId: string | null = null;
    let unresolvedLgaRaw: string | null = null;
    const lgaRaw = row.canonical.lgaId;
    if (lgaRaw) {
      const resolved = resolveLga(lgaRaw);
      // Only a canonical LGA code may enter the `lgaId` column — downstream
      // joins (marketplace, registry density/analytics) key on `lgas.code`, so
      // storing raw unmatched text there would silently pollute LGA rollups.
      // Keep the person; preserve the unresolved raw in metadata instead.
      lgaId = resolved.code ?? null;
      if (!resolved.code) unresolvedLgaRaw = lgaRaw;
      if (resolved.warning) warnings.push(`lgaId:${resolved.warning}`);
    }
    if (ninRaw && !nin) warnings.push('nin:invalid_dropped');

    const importExtra: Record<string, string> = {};
    for (const [field, key] of EXTRA_FIELDS) {
      const val = row.canonical[field];
      if (val) importExtra[key] = val;
    }
    if (unresolvedLgaRaw) importExtra.lga_raw = unresolvedLgaRaw;

    const metadata: IngestRespondent['metadata'] = {};
    if (warnings.length) metadata.normalisation_warnings = warnings;
    if (row.canonical.email) metadata.imported_email = row.canonical.email;
    if (Object.keys(importExtra).length) metadata.import_extra = importExtra;

    toInsert.push({
      rowIndex: row.rowIndex,
      respondent: {
        firstName,
        lastName,
        phoneNumber: phone,
        nin,
        lgaId,
        dateOfBirth: row.canonical.dateOfBirth ?? null,
        consentMarketplace: hasConsentColumn ? true : false,
        externalReferenceId: row.canonical.externalReferenceId ?? null,
        metadata,
      },
    });
  }

  return { toInsert, dispositions };
}

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
 *   3. matched — the SAME PERSON already exists: a NIN match (batch or registry),
 *                or a REGISTRY phone match (13-2: don't double-count someone who
 *                already self-registered)
 *   4. insert  — everything else, INCLUDING rows that merely share a phone with
 *                another row of this batch (flagged `identityAmbiguous`)
 *
 * ⚠️ Dedup is NOT "phone OR NIN". Taxonomy **R2 (LOCKED 2026-07-04)** gives the
 * identity key a PRECEDENCE — NIN → E.164 phone → respondent.id — and forbids a
 * shared phone from merging distinct people: *"never silently merged, never silently
 * double-counted."* A batch-local phone collision on rows WITHOUT a NIN cannot tell
 * "one person twice" from "a household on one handset", so both rows are kept and
 * flagged. Email is preserved as provenance, never a dedup key.
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
  /**
   * Taxonomy R2 — this row shares a phone with another row and carries NO NIN, so
   * nothing distinguishes "one person, two rows" from "a household on one handset".
   * It is INSERTED (never silently dropped) and flagged for the uncertainty band.
   */
  identityAmbiguous?: boolean;
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
  /**
   * How many of `toInsert` are R2-ambiguous. Reconciles with 12-4's
   * `identityAmbiguous` on the dashboard — the two MUST agree, which is the whole
   * point of both sides sharing one key.
   */
  identityAmbiguousCount: number;
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

  /*
   * R2 PRE-PASS — which phones are shared by MORE THAN ONE row of this batch?
   *
   * ⚠️ Needed for RECONCILIATION, not for the decision. 12-4 counts EVERY member of a
   * shared-`tel:` group (`identityAmbiguous += groupRows.length`), so flagging only
   * the second-and-later row would report 1 where the dashboard reports 2 — and R2's
   * whole requirement is that the two sides agree. A first-seen row is just as
   * ambiguous as the row that collides with it; only the ARRIVAL ORDER differs.
   * Rows carrying a NIN are excluded: NIN outranks phone in the R2 precedence.
   */
  const phoneRowCount = new Map<string, number>();
  for (const r of rows) {
    const p = r.canonical.phoneNumber ?? '';
    const n = r.canonical.nin ?? '';
    if (!VALID_PHONE.test(p) || VALID_NIN.test(n)) continue;
    phoneRowCount.set(p, (phoneRowCount.get(p) ?? 0) + 1);
  }

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

    /*
     * 3. Dedup — Registry Data-Status Taxonomy **R2 (LOCKED 2026-07-04)**.
     *
     * The identity key has a PRECEDENCE, and it is not "phone OR NIN":
     *     1. NIN (when present) → 2. phone (E.164) → 3. respondent.id
     *
     * ⛔ WHY THIS CHANGED (2026-08-25). The previous rule dropped ANY phone match as
     * `matched`. Measured against the real association intake that silently discarded
     * **441 people** — co-operative and household handsets where two DIFFERENT names
     * share one number. R2 forbids exactly that: such rows
     * *"go into an explicit `identity_ambiguous` bucket … never silently merged,
     * never silently double-counted"*, and it requires this importer to
     * *"resolve to the SAME key so the dashboard's distinct total and the importer's
     * 'skipped as duplicate' count reconcile."*
     *
     * ⭐ It now matches `registry-totals.service.ts` exactly. 12-4 groups on `tel:`
     * ONLY when a row has no NIN (NIN takes precedence), and keeps every member of a
     * shared-`tel:` group while counting it ambiguous. So:
     *   - NIN match          → genuine duplicate → `matched` (and the DB's partial
     *                          unique index on `nin` is the backstop).
     *   - phone match + NIN  → the NIN already proves a distinct person → INSERT clean.
     *   - phone match, no NIN→ nothing disambiguates → INSERT + flag ambiguous.
     * `phone_number` carries a NON-unique index precisely so this is legal.
     */
    if (nin && seenNins.has(nin)) {
      dispositions.push({ rowIndex: row.rowIndex, category: 'matched', reason: 'nin_match_in_batch' });
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
    /*
     * ⚠️ REGISTRY match vs BATCH match are NOT the same question.
     *
     * A phone already in the REGISTRY means that person is ALREADY COUNTED. Inserting
     * again is the double-count 13-2's own story forbids — *"don't double-count
     * members who already self-registered."* That stays a `matched` drop.
     *
     * A phone repeated WITHIN THE BATCH means two rows on one association sheet,
     * NEITHER of them counted yet. That is R2's household-handset case, and dropping
     * it is the silent merge R2 forbids. Measured: 441 such people in the association
     * intake vs 14 genuine registry collisions.
     */
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
    // Flag EVERY member of a shared-phone group, not just the later arrivals —
    // otherwise this count can never reconcile with 12-4's.
    const identityAmbiguous = !nin && (phoneRowCount.get(phone) ?? 0) > 1;

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

    // R2: the flag travels WITH the row, so the ambiguity is queryable after the
    // import and not merely a number in a dry-run report that nobody kept.
    if (identityAmbiguous) warnings.push('identity:ambiguous_shared_phone_no_nin');

    const metadata: IngestRespondent['metadata'] = {};
    if (warnings.length) metadata.normalisation_warnings = warnings;
    if (row.canonical.email) metadata.imported_email = row.canonical.email;
    if (Object.keys(importExtra).length) metadata.import_extra = importExtra;

    toInsert.push({
      identityAmbiguous: identityAmbiguous || undefined,
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

  return {
    toInsert,
    dispositions,
    identityAmbiguousCount: toInsert.filter((c) => c.identityAmbiguous).length,
  };
}

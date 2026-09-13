/**
 * Batch integrity — Story 13-2 R-A2 review, proposal P2. PURE, no DB.
 *
 * One reading per import batch of the numbers a padded roll would disturb. It is the
 * batch-level companion to the per-row `roll_padding` fraud heuristic, and it exists
 * because the per-row check measured 0 of 8,278 flagged on prod: association rolls
 * arrive pre-cleaned, so the evidence lives in the batch's arithmetic (declared vs
 * received, what cleaning removed, matched-existing share), not in any single row.
 *
 * ⛔ NO SCORE, NO THRESHOLDS. Every signal is arithmetic that is either true or not —
 * "more people landed than the head declared" — never a cut-off someone guessed. A
 * reviewer reads the numbers; a score would invite acting on a number nobody
 * calibrated (the exact trap R-A8 records for the per-row heuristic).
 *
 * The same function serves the dry-run (predicted, over the planned inserts), the
 * confirm response (recorded) and the batch detail endpoint (recorded, over the rows
 * now on the register), so all three can never disagree on how a figure is derived.
 */

import type { ImportBatchIntegrity, ImportIntegritySignal, ImportProvenanceStats } from '@oslsr/types';

export interface IntegrityRow {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  lgaId: string | null;
}

export interface IntegrityInput {
  basis: ImportBatchIntegrity['basis'];
  rowsParsed: number;
  rowsFailed: number;
  inserted: number;
  matchedExisting: number;
  skipped: number;
  /** The rows that were (or will be) inserted — the population the pair counts read. */
  rows: IntegrityRow[];
  provenance: ImportProvenanceStats | null;
  /** Association batches are expected to carry provenance; others are not flagged. */
  isAssociationBatch: boolean;
}

/**
 * Order-insensitive name key: lower-cased tokens, sorted. Same rule as the roll-padding
 * heuristic's SQL key (13-2 R-A6: name ORDER is unreliable in the NCARES rows), computed
 * in JS here because this module is pure. It is only ever compared with itself.
 */
export function nameKey(firstName: string | null, lastName: string | null): string {
  return `${firstName ?? ''} ${lastName ?? ''}`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function rowsInGroupsLargerThanOne(keys: Array<string | null>): { rows: number; groups: number; max: number } {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let rows = 0;
  let groups = 0;
  let max = 0;
  for (const n of counts.values()) {
    if (n > 1) {
      rows += n;
      groups += 1;
    }
    if (n > max) max = n;
  }
  return { rows, groups, max };
}

export function computeBatchIntegrity(input: IntegrityInput): ImportBatchIntegrity {
  const phones = rowsInGroupsLargerThanOne(input.rows.map((r) => r.phoneNumber));
  const names = rowsInGroupsLargerThanOne(
    input.rows.map((r) => {
      const key = nameKey(r.firstName, r.lastName);
      return key ? `${r.lgaId ?? ''}|${key}` : null;
    }),
  );

  const p = input.provenance;
  const received = input.inserted + input.matchedExisting;
  const declaredGap = p?.declaredMembers !== undefined ? received - p.declaredMembers : null;
  const cleanOverRaw =
    p?.rawRows !== undefined && p.cleanRows !== undefined && p.rawRows > 0
      ? Math.round((p.cleanRows / p.rawRows) * 10_000) / 10_000
      : null;

  const signals: ImportIntegritySignal[] = [];
  if (declaredGap !== null && declaredGap > 0) signals.push('received_exceeds_declared');
  if (declaredGap !== null && declaredGap < 0) signals.push('received_below_declared');
  if (input.isAssociationBatch && p === null) signals.push('provenance_missing');
  if (phones.rows > 0) signals.push('shared_phone_rows_present');
  if (names.rows > 0) signals.push('same_name_rows_present');
  if (input.matchedExisting > 0) signals.push('rows_matched_existing');

  return {
    basis: input.basis,
    rowsParsed: input.rowsParsed,
    rowsFailed: input.rowsFailed,
    inserted: input.inserted,
    matchedExisting: input.matchedExisting,
    skipped: input.skipped,
    matchedExistingRatio:
      input.rowsParsed > 0 ? Math.round((input.matchedExisting / input.rowsParsed) * 10_000) / 10_000 : null,
    sharedPhoneRows: phones.rows,
    sharedPhoneNumbers: phones.groups,
    maxRowsPerPhone: phones.max,
    sameNameRows: names.rows,
    provenance: p,
    cleanOverRaw,
    declaredGap,
    signals,
  };
}

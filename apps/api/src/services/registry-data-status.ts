/**
 * Registry Data-Status Model — the CANONICAL data-completeness taxonomy.
 *
 * Story 9-59 (Unified Registry Export). The registry is NOT a single clean
 * number: prod 2026-06-15 = 139 respondents = 76 completed + 55 data_lost +
 * 7 no-submission + 1 pending-NIN. The dashboard's "Total Respondents" counts
 * only the 76 (submissions with raw_data) yet labels it the whole registry —
 * the core legibility bug.
 *
 * This module is the SINGLE SOURCE OF TRUTH for "what state is this respondent
 * in?". The unified export consumes it now; the forthcoming "Dashboard System
 * Refresh" analytics epic (shared `registryTotals` model + Data Health view)
 * MUST consume THIS module rather than re-deriving its own taxonomy — otherwise
 * the export and the analytics pages diverge on what "completed/data_lost"
 * means. Per the 9-59 sequencing decision (operator, 2026-06-16) 9-59 defines
 * the canonical model and the analytics epic builds on it.
 *
 * Pure functions only — no DB, no I/O — so it is trivially unit-testable and
 * safe to import from any service (export, analytics, registry).
 */

/**
 * The canonical data-completeness states a respondent row can be in.
 * Mutually exclusive; `deriveDataStatus` picks the single most-informative one.
 */
export const REGISTRY_DATA_STATUSES = [
  'completed', // latest submission has non-empty raw_data (questionnaire answers present)
  'data_lost', // metadata.questionnaire_data_lost — row exists, answers irrecoverable (pre-2026-05-20 hemorrhage)
  'pending_nin', // respondent self-deferred NIN capture (status = pending_nin_capture)
  'nin_unavailable', // NIN confirmed unavailable (status = nin_unavailable)
  'imported', // ingested from an external source (ITF-SUPA / other) — status imported_unverified or source imported_*
  'no_submission', // respondent row with no questionnaire submission and none of the above
] as const;

export type RegistryDataStatus = typeof REGISTRY_DATA_STATUSES[number];

/** Minimal respondent shape needed to derive data-status (decoupled from the Drizzle row type). */
export interface DataStatusInput {
  /** Whether the respondent's latest submission carries non-empty `raw_data`. */
  hasSubmissionData: boolean;
  /** `respondents.status` lifecycle value. */
  status?: string | null;
  /** `respondents.source` provenance value. */
  source?: string | null;
  /** `respondents.metadata` JSONB (only `questionnaire_data_lost` is read here). */
  metadata?: { questionnaire_data_lost?: boolean } | null;
}

/**
 * Derive the single canonical data-status for a respondent row.
 *
 * Precedence (most-informative first), so the buckets are mutually exclusive
 * and reproduce the documented 139 = 76 + 55 + 1 + 7 split:
 *   1. completed        — answers are present (the headline state)
 *   2. data_lost        — explicit irrecoverable-loss marker
 *   3. pending_nin      — lifecycle: awaiting NIN
 *   4. nin_unavailable  — lifecycle: NIN confirmed unavailable
 *   5. imported         — external-source provenance
 *   6. no_submission    — none of the above
 */
export function deriveDataStatus(input: DataStatusInput): RegistryDataStatus {
  if (input.hasSubmissionData) return 'completed';
  if (input.metadata?.questionnaire_data_lost === true) return 'data_lost';
  if (input.status === 'pending_nin_capture') return 'pending_nin';
  if (input.status === 'nin_unavailable') return 'nin_unavailable';
  if (input.status === 'imported_unverified') return 'imported';
  if (typeof input.source === 'string' && input.source.startsWith('imported_')) return 'imported';
  return 'no_submission';
}

/**
 * Whether a JSONB `raw_data` value counts as "has answers".
 * Null/undefined or an empty object → false. Centralised so the export query,
 * the count query, and analytics all agree on the same emptiness test.
 */
export function hasNonEmptyRawData(rawData: unknown): boolean {
  if (rawData == null || typeof rawData !== 'object') return false;
  return Object.keys(rawData as Record<string, unknown>).length > 0;
}

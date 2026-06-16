/**
 * Registry Key-Normalization Model — the CANONICAL cross-form-version key map.
 *
 * Story 9-59 (Unified Registry Export). Questionnaire answers live in
 * `submissions.raw_data` (JSONB) and the key set has DRIFTED across form
 * versions: the same concept appears under several names (prod-observed:
 * `dob`↔`date_of_birth`; `firstname`↔`first_name`↔`surname`↔`last_name`;
 * `gps_location`↔`_gpsLatitude`/`_gpsLongitude`). Exporting the raw union of
 * keys produces confusing half-empty duplicate columns.
 *
 * This module is the SINGLE SOURCE OF TRUTH for "these raw keys mean the same
 * thing". The unified export consumes it; the forthcoming analytics epic must
 * feed the SAME map into its survey-analytics aggregation (one map, both
 * surfaces) rather than maintaining a private copy.
 *
 * Design — ADDITIVE normalization (not rename): for each concept group, the
 * first non-empty variant's value is written to EVERY variant key in the group.
 * This guarantees the answer is found regardless of which variant name the
 * active form schema's question happens to use (the export's answer columns are
 * built from the schema via `buildColumnsFromFormSchema`, so the lookup key is
 * the schema question name — which may be `dob` OR `date_of_birth`). Renaming to
 * one fixed canonical key would break whichever schema used the other spelling;
 * filling all variants is robust to both. Extra keys not in the schema are
 * simply ignored downstream, so the additive copy never widens the CSV.
 *
 * Pure functions only — no DB, no I/O.
 */

/**
 * Concept → all known raw_data key spellings for that concept.
 * Table-driven and easy to extend as the form evolves (add a spelling to the
 * relevant group, or add a new group). Order within a group is the
 * first-non-empty-wins preference order.
 */
export const CANONICAL_KEY_GROUPS: Record<string, readonly string[]> = {
  date_of_birth: ['date_of_birth', 'dob'],
  first_name: ['first_name', 'firstName', 'firstname'],
  last_name: ['last_name', 'lastName', 'lastname', 'surname'],
  phone_number: ['phone_number', 'phoneNumber', 'phone', 'msisdn'],
  gps_latitude: ['gps_latitude', '_gpsLatitude', 'gpsLatitude'],
  gps_longitude: ['gps_longitude', '_gpsLongitude', 'gpsLongitude'],
  gps_location: ['gps_location', 'gpsLocation'],
};

/**
 * Return the canonical variant group a raw key belongs to, or `undefined` if it
 * is not part of any group. Lets a consumer ask "is this raw key representable
 * by one of the schema's question names?" without re-implementing the table —
 * used by the unified export to detect answer keys that the chosen form schema
 * has no column for (Story 9-59 review M1).
 *
 * Caveat (review L3): normalization is ADDITIVE, not rename-to-one. If a single
 * form schema were to contain TWO spellings from the same group as distinct
 * questions (e.g. both `surname` and `last_name`), both columns would be filled
 * rather than deduped. That is a degenerate schema we do not expect; the dedup
 * guarantee holds because answer columns come from the schema, which in practice
 * uses one spelling per concept.
 */
export function canonicalGroupFor(key: string): readonly string[] | undefined {
  for (const variants of Object.values(CANONICAL_KEY_GROUPS)) {
    if (variants.includes(key)) return variants;
  }
  return undefined;
}

/** Treats null/undefined/empty-string as "no value" (mirrors flattenRawDataRow's emptiness test). */
function isEmpty(value: unknown): boolean {
  return value == null || value === '';
}

/**
 * Return a shallow copy of `rawData` where, for each canonical concept group,
 * the first non-empty variant's value is propagated to ALL variant keys in the
 * group. Keys outside every group are passed through untouched. The input is
 * not mutated.
 *
 * Example: `{ dob: '1990-01-01' }` → `{ dob: '1990-01-01', date_of_birth: '1990-01-01' }`
 * so a schema question named either `dob` or `date_of_birth` resolves the value.
 */
export function normalizeRawDataKeys(
  rawData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rawData };

  for (const variants of Object.values(CANONICAL_KEY_GROUPS)) {
    // First non-empty value in preference order wins for the whole group.
    let resolved: unknown;
    for (const key of variants) {
      if (!isEmpty(out[key])) {
        resolved = out[key];
        break;
      }
    }
    if (resolved === undefined) continue; // group entirely absent/empty → leave as-is
    for (const key of variants) {
      if (isEmpty(out[key])) out[key] = resolved;
    }
  }

  return out;
}

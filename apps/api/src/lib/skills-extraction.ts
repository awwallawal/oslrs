import { sql, type SQL } from 'drizzle-orm';

/**
 * Shared extraction for `select_multiple` fields stored in `submissions.raw_data`
 * (Story 13-22). The public wizard persists these as a JSONB **array**, e.g.
 * `["carpentry","plumbing"]` — the correct, canonical representation. Older /
 * paper-import paths could conceivably have stored a space-delimited scalar
 * string (`"carpentry plumbing"`); the prod audit found none, but we stay
 * defensive so a single legacy row can never break a query or mis-tokenise.
 *
 * The historical bug: every SQL consumer read these with
 * `unnest(string_to_array(raw_data->>'field', ' '))` — splitting the JSON
 * *text* (`["carpentry", "plumbing"]`) on spaces, yielding garbage tokens
 * (`["carpentry",`, `"plumbing"]`) on 100% of real rows.
 */

/**
 * SQL fragment that laterally unnests a raw_data `select_multiple` field into a
 * set of clean text tokens. Use in the FROM clause with an alias:
 *
 * ```ts
 * FROM submissions s
 * LEFT JOIN respondents r ON r.id = s.respondent_id,
 *      ${selectMultipleUnnest(sql`s.raw_data`, 'skills_possessed')} AS skill
 * ```
 *
 * `jsonb_array_elements_text` throws on a non-array, so guard by `jsonb_typeof`:
 * - `array`  → unnest the array elements directly (the real, canonical shape)
 * - `string` → split a legacy **space-delimited** scalar (the XLSForm/ODK
 *   select_multiple shape) into an array first. NB: this handles only the
 *   space-delimited form — a scalar that is itself JSON-array text is not
 *   re-parsed (the prod audit found none). The TS twin uses the identical rule.
 * - anything else (null / number / object) → empty set (row contributes nothing)
 */
export function selectMultipleUnnest(jsonbColumn: SQL, field: string): SQL {
  return sql`jsonb_array_elements_text(
    CASE jsonb_typeof(${jsonbColumn} -> ${field})
      WHEN 'array' THEN ${jsonbColumn} -> ${field}
      WHEN 'string' THEN to_jsonb(string_to_array(${jsonbColumn} ->> ${field}, ' '))
      ELSE '[]'::jsonb
    END
  )`;
}

/**
 * TypeScript twin of {@link selectMultipleUnnest} for consumers that read
 * raw_data in application code rather than SQL (e.g. the marketplace extraction
 * worker). Same contract: a JSON array yields its trimmed string elements; a
 * space-delimited scalar string is split; anything else yields `[]`. Empty
 * tokens are dropped, and JSON `null`/`undefined` array elements are dropped
 * (matching SQL `jsonb_array_elements_text`, which yields SQL NULL for them —
 * never the literal string `"null"`).
 */
export function extractSelectMultipleValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(' ').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

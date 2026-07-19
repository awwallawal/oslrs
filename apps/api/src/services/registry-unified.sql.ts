/**
 * Registry Unified — the ONE canonical SQL definition (Story 13-33).
 *
 * This leaf module holds the single source of truth for the respondent-anchored
 * unified registry read, as a **parameter-free SQL string**. It imports nothing
 * heavy (no `db`, no drizzle) so it can be pulled into BOTH:
 *   1. the runtime service (`registry-unified.ts`, via `sql.raw(...)`), and
 *   2. the view-init runner (`scripts/migrate-registry-unified-view-init.ts`,
 *      via `pg.Pool`).
 *
 * ── Why one text constant (belt AND suspenders, without drift) ───────────────
 * The failure mode of "a VIEW and a service" is that the two definitions drift —
 * the exact submission-vs-respondent divergence this story exists to kill. So
 * there is exactly ONE place the shape is written (here); the view is
 * `CREATE OR REPLACE VIEW registry_unified AS <this text>` and the service
 * composes `(<this text>)` inline. A parity integration test asserts
 * `COUNT(view) === COUNT(inline) === count-core === export-rows`, so a stale
 * view reddens CI rather than lying in prod.
 *
 * ── The shape: respondent-anchored, one row per respondent ───────────────────
 * `FROM respondents r LEFT JOIN LATERAL (latest NON-EMPTY submission)` — the
 * same LATERAL used by `getRegistryCountCore` (13-25) and `getUnifiedExportData`
 * (9-59). Because it starts `FROM respondents`, a person with NO submission
 * (imported / data_lost / no_submission / pending_nin) still appears exactly
 * once — the "nothing is missing" convergence. The LATERAL returns ≤1 row, so no
 * `DISTINCT ON` is needed. `raw_data` is the answers of the latest submission
 * that ACTUALLY has answers (a later empty/correction submission cannot mask an
 * earlier completed one).
 *
 * ── Columns (the substrate consumers + 12-4 need) ────────────────────────────
 * Identity/geo/consent/provenance come from the respondent row; `raw_data`
 * carries the survey answers (gender/employment/business/skills live only in
 * JSONB). `nin` is exposed as a boolean-able substrate for 12-4's Axis-3
 * verification derivation (NIN presence). The full orthogonal 3-axis
 * decomposition (completeness/verification) is deliberately NOT derived here —
 * that is Story 12-4 AC7 (its deep-field marker-set config + `nin_on_file ≠
 * verified` ruling). 13-33 exposes Axis-1 `source` + the raw substrate; 12-4
 * aggregates over THIS read. See the story's no-clash boundary note.
 *
 * ── Adding a column? (the governance — read before editing the SELECT) ────────
 * This read is the ONE shape every registry consumer aggregates over, so a new
 * column serves ALL of them and must be justified, not convenient. Rules:
 *   1. RAW substrate only — expose the stored column (e.g. `nin`, `status`,
 *      `source`, `raw_data`); do NOT bake derivations/normalization in here
 *      (E.164, completeness axes, etc.) — those live in the consumer / a shared
 *      TS helper so there is exactly one derivation site.
 *   2. State WHO needs it + WHY in this list (mirrors `nin` → 12-4 Axis-3).
 *   3. It stays one-row-per-respondent (add respondent columns or fields from
 *      the latest-non-empty submission; never anything that fans out the grain).
 *   4. After editing, re-run the parity smoke (view ≡ inline ≡ count-core ≡
 *      export) — a column change alters the view's column set (DROP+CREATE path).
 * KNOWN PENDING CANDIDATE: `phone_number` (raw) — for 12-4 AC2's R2 identity-key
 * dedup (NIN → E.164 phone → id). Ruled (John/PM 2026-07-19): add it WHEN 12-4's
 * dedup needs it, not speculatively; E.164 normalization stays in
 * `registry-key-normalization.ts`. See 12-4 "🔗 13-33 hand-off" Dev Note.
 */

/** The physical view name (single source of truth for the identifier). */
export const REGISTRY_UNIFIED_VIEW_NAME = 'registry_unified';

/**
 * The canonical respondent-anchored unified read, as parameter-free SQL.
 * One row per `respondents.id`. Snake_case columns (DB convention).
 *
 * NOTE: parameter-free by design — safe to embed via `sql.raw(...)` (no user
 * input flows through it) and to interpolate into the `CREATE OR REPLACE VIEW`
 * DDL. Any filtering/scoping is applied by consumers in an outer query.
 */
export const REGISTRY_UNIFIED_SQL_TEXT = `
  SELECT
    r.id                   AS respondent_id,
    r.lga_id               AS lga_id,
    r.source               AS source,
    r.status               AS status,
    r.nin                  AS nin,
    r.metadata             AS metadata,
    r.consent_marketplace  AS consent_marketplace,
    r.consent_enriched     AS consent_enriched,
    r.created_at           AS created_at,
    answers.raw_data       AS raw_data
  FROM respondents r
  LEFT JOIN LATERAL (
    SELECT sx.raw_data
    FROM submissions sx
    WHERE sx.respondent_id = r.id
      AND sx.raw_data IS NOT NULL
      AND sx.raw_data <> '{}'::jsonb
    ORDER BY sx.submitted_at DESC NULLS LAST
    LIMIT 1
  ) answers ON true
`;

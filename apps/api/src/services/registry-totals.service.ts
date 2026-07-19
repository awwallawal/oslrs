/**
 * Registry Totals — the canonical respondent-scoped count-core.
 *
 * Story 13-25 (launch slice of Epic 12 / 12-4). The public /insights page and
 * the internal dashboard both counted `COUNT(*) FROM submissions` (~79),
 * silently dropping the registered-but-answerless respondents (Cohort-A
 * `data_lost` salvage + `no_submission` + `pending_nin`). That understated the
 * public register by ~45% on the very page the launch blast drives traffic to.
 * This module counts registered PEOPLE, not submissions.
 *
 * ── Forward-compatibility (AC4) ─────────────────────────────────────────────
 * `getRegistryCountCore()` is the PRE-LAUNCH SEED of 12-4's forthcoming
 * `getRegistryTotals()`. Its `{ totalRespondents, withAnswers }` is exactly
 * 12-4's AC1/AC3 minimal slice — total registered people + the completed-survey
 * subset. When Epic 12 lands, 12-4 builds the full 3-axis decomposition
 * (`data_lost` / `no_submission` / `pending_nin` / `nin_unavailable` /
 * `imported`), the R2 identity-key `COUNT(DISTINCT person)`, and the
 * `/api/v1/analytics/registry-totals` endpoint ON this same function — so there
 * is ONE registry count, never a divergent second one. See
 * `registry-data-status.ts` (the 9-59 taxonomy atom) which this consumes.
 *
 * ── `withAnswers` semantics ─────────────────────────────────────────────────
 * `withAnswers` is the SQL embodiment of the 9-59 `hasNonEmptyRawData` atom —
 * i.e. the `deriveDataStatus(...) === 'completed'` bucket: a respondent whose
 * latest NON-EMPTY submission carries questionnaire answers. The emptiness test
 * (`raw_data IS NOT NULL AND raw_data <> '{}'`) and the latest-non-empty LATERAL
 * mirror `getUnifiedExportData` (export-query.service.ts) exactly, so the export
 * row-count, this count-core, and analytics all agree on what "completed" means.
 *
 * ── Canonical unified read (Story 13-33) ────────────────────────────────────
 * As of 13-33 this count is expressed OVER the ONE canonical respondent-anchored
 * read (`registryUnifiedSource`) rather than a hand-rolled LATERAL, so count-core
 * and every other consumer (public insights, density, 12-4) read the identical
 * shape — no second definition to drift from. `with_answers` = the count of
 * unified rows whose `raw_data` is non-null (the LATERAL already keeps only the
 * latest NON-EMPTY submission's answers).
 *
 * ── Grain ───────────────────────────────────────────────────────────────────
 * Row-id-distinct (one row per `respondents.id`) is the accepted slice grain;
 * the R2 identity-key refinement (`COUNT(DISTINCT person)`) rides with the full
 * 12-4 model post-launch. No respondent-row exclusion filter is applied — the
 * unfiltered respondent count IS the registry (mirrors `getUnifiedExportData`'s
 * unfiltered count).
 *
 * Raw `db.execute(sql...)` — guarded by a real-DB smoke test (12-4 drift
 * discipline) so a renamed column fails a test, not prod.
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { registryUnifiedSource } from './registry-unified.js';

export interface RegistryCountCore {
  /** Distinct registered people (one row per `respondents.id`) — the honest headline count. */
  totalRespondents: number;
  /**
   * Subset whose latest non-empty submission carries survey answers
   * (`deriveDataStatus === 'completed'`) — the count of registered PEOPLE the
   * demographic / skills breakdowns describe. (The breakdown percentages are
   * computed over the answer-bearing SUBMISSIONS, submission-scoped, which
   * equals this people-count today but can diverge under multi-submission
   * respondents; they converge under full 12-4.)
   */
  withAnswers: number;
}

/**
 * Count registered people and the completed-survey subset in a single query.
 * @see RegistryCountCore
 */
export async function getRegistryCountCore(): Promise<RegistryCountCore> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_respondents,
      COUNT(ru.raw_data)::int AS with_answers
    FROM ${registryUnifiedSource('ru')}
  `);

  const row = result.rows[0] as
    | { total_respondents: number | string; with_answers: number | string }
    | undefined;

  return {
    totalRespondents: Number(row?.total_respondents ?? 0),
    withAnswers: Number(row?.with_answers ?? 0),
  };
}

import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { REGISTRY_UNIFIED_SQL_TEXT } from '../src/services/registry-unified.js';

/**
 * Shared test helper — count rows of the CANONICAL unified registry read
 * (13-33 `registryUnifiedSource`, the same SQL `getRegistryCountCore` and the
 * unified export read) **scoped to the respondent ids a suite owns**.
 *
 * WHY THIS EXISTS (2026-07-22): the registry reads are global by design — no
 * scope filter, the whole registry IS the read — so DB smokes used to capture a
 * global baseline in `beforeAll` and assert `after - baseline === INSERTED`.
 * That is unsound on a shared test DB: vitest runs test FILES in parallel (only
 * the pre-push gate serialises them), so ANY other file inserting a respondent
 * in that window reddens the suite (observed: `expected 16 to be 15`) — and it
 * passes in isolation, so it reads like environmental contention and gets
 * re-run rather than fixed.
 *
 * Rule: **never assert a global count or delta you don't own.** Scope the
 * assertion to your own rows with this helper; keep calling the global service
 * separately if you also want to prove it EXECUTES against the real schema
 * (the raw-SQL ↔ schema drift guard), and assert only invariants there
 * (e.g. withAnswers ≤ totalRespondents) that no concurrent writer can break.
 */
export interface ScopedRegistryCounts {
  /** Rows in the unified read for the given respondent ids (1 per respondent). */
  total: number;
  /** How many of those carry non-empty `raw_data` (the with-answers subset). */
  withAnswers: number;
}

export async function countScopedRegistryRows(
  respondentIds: readonly string[],
): Promise<ScopedRegistryCounts> {
  if (respondentIds.length === 0) return { total: 0, withAnswers: 0 };

  const idList = sql.join(
    respondentIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(ru.raw_data)::int AS with_answers
    FROM (${sql.raw(REGISTRY_UNIFIED_SQL_TEXT)}) ru
    WHERE ru.respondent_id::text IN (${idList})
  `);

  const row = result.rows[0] as { total: number | string; with_answers: number | string } | undefined;
  return {
    total: Number(row?.total ?? 0),
    withAnswers: Number(row?.with_answers ?? 0),
  };
}

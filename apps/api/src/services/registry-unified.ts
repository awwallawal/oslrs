/**
 * Registry Unified Service — the canonical respondent-anchored read (Story 13-33).
 *
 * Every registry-fact consumer (public insights headline + breakdowns + density,
 * count-core, and — post-launch — 12-4's `getRegistryTotals`) reads through the
 * ONE shape defined in `registry-unified.sql.ts`. This module exposes that shape
 * as a composable `FROM` source so a consumer writes its aggregate as
 * `... FROM ${registryUnifiedSource('ru')} WHERE ... GROUP BY ...` instead of
 * re-inventing the respondent⟕submission join (the re-derivation that let the
 * 76-vs-139 drift happen across ≥4 services).
 *
 * ── Belt AND suspenders (view + service, proven identical) ───────────────────
 * - **Belt (runtime):** consumers compose the canonical SQL **inline**
 *   (`registryUnifiedSource`). Inline has NO migration dependency — a missing or
 *   not-yet-created `registry_unified` view can never 500 the public /insights
 *   page — and the planner treats the inlined subquery identically to the view.
 * - **Suspenders (the object):** `scripts/migrate-registry-unified-view-init.ts`
 *   creates the physical `registry_unified` VIEW from the SAME
 *   `REGISTRY_UNIFIED_SQL_TEXT`, giving analysts / BI / 12-4 the literal "one
 *   table everything reads from". `getRegistryUnifiedViewFromDb()` reads the
 *   view; the parity integration test asserts view-count === inline-count ===
 *   count-core === export-rows, so the two can never silently diverge.
 *
 * Kept a plain inline source (not a memoised `to_regclass` view-probe) on
 * purpose: a probe would add a `db.execute` call that reorders the tightly
 * sequenced mocked-DB tests in the consumers. Switching the runtime path onto
 * the view later is a one-line change here now that both are proven equal.
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  REGISTRY_UNIFIED_SQL_TEXT,
  REGISTRY_UNIFIED_VIEW_NAME,
} from './registry-unified.sql.js';

export { REGISTRY_UNIFIED_SQL_TEXT, REGISTRY_UNIFIED_VIEW_NAME };

/**
 * One canonical unified-read row (one per `respondents.id`). Snake_case mirrors
 * the SQL column aliases; consumers extract survey fields from `raw_data`.
 */
export interface RegistryUnifiedRow {
  respondent_id: string;
  lga_id: string | null;
  source: string;
  status: string;
  nin: string | null;
  metadata: Record<string, unknown> | null;
  consent_marketplace: boolean;
  consent_enriched: boolean;
  created_at: string | Date | null;
  /** Latest NON-EMPTY submission's answers, or null when the respondent has none. */
  raw_data: Record<string, unknown> | null;
}

/**
 * The canonical respondent-anchored read as a composable `FROM` source.
 * Compose it: `sql\`SELECT ... FROM ${registryUnifiedSource('ru')} WHERE ...\``.
 *
 * Returns the inline canonical subquery aliased as `alias` (default `ru`).
 * Parameter-free canonical SQL → `sql.raw` is safe (no user input).
 *
 * @param alias table alias to expose (default `ru`).
 */
export function registryUnifiedSource(alias = 'ru'): SQL {
  return sql`(${sql.raw(REGISTRY_UNIFIED_SQL_TEXT)}) AS ${sql.raw(alias)}`;
}

/**
 * Read every unified row directly (test/diagnostic helper). Not on any hot path
 * — the public surface aggregates in SQL. Reads via the INLINE canonical source.
 */
export async function getRegistryUnifiedRows(): Promise<RegistryUnifiedRow[]> {
  const result = await db.execute(sql`SELECT * FROM ${registryUnifiedSource('ru')}`);
  return result.rows as unknown as RegistryUnifiedRow[];
}

/**
 * Read the unified rows through the PHYSICAL `registry_unified` VIEW (the
 * suspenders path). Throws if the view is absent — used by the parity
 * integration test to prove the view is present AND identical to inline.
 */
export async function getRegistryUnifiedViewRows(): Promise<RegistryUnifiedRow[]> {
  const result = await db.execute(
    sql`SELECT * FROM ${sql.raw(REGISTRY_UNIFIED_VIEW_NAME)}`,
  );
  return result.rows as unknown as RegistryUnifiedRow[];
}

/** Whether the physical `registry_unified` view exists (diagnostic / test). */
export async function registryUnifiedViewExists(): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT to_regclass(${REGISTRY_UNIFIED_VIEW_NAME}) AS oid`,
  );
  const row = result.rows[0] as { oid: string | null } | undefined;
  return row?.oid != null;
}

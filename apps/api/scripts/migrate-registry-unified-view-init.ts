/**
 * Story 13-33 — `registry_unified` VIEW (idempotent runner).
 *
 * Creates the physical `registry_unified` VIEW as `CREATE OR REPLACE VIEW ... AS
 * <REGISTRY_UNIFIED_SQL_TEXT>`, importing the EXACT canonical SQL the runtime
 * service composes inline (`apps/api/src/services/registry-unified.sql.ts`). So
 * the view and the service are, by construction, the same query — the parity
 * integration test (`registry-unified-db-smoke.integration.test.ts`) then proves
 * view-count === inline-count === count-core === export-rows.
 *
 * Why an init-runner (not a Drizzle view): drizzle-kit `db:push:force`
 * aggressively reconciles and cannot express this LATERAL/COALESCE view, and the
 * project already creates its non-Drizzle DB objects (GIN/trigram/expression
 * indexes, CHECK constraints, partial uniques) through `migrate-*-init.ts`
 * runners. This follows that established convention exactly.
 *
 * Wired into:
 *   - Local + CI test DB: auto-discovered by `apps/api/scripts/db-push-full.ts`
 *     (matches the `migrate-*-init.ts` glob). CI test-api runs `db:push:full:force`.
 *   - Prod: explicit step in `.github/workflows/ci-cd.yml` deploy chain.
 *
 * Idempotent AND atomic where possible (13-33 review L4): try `CREATE OR REPLACE
 * VIEW` FIRST — it swaps the definition in place with no window where the view is
 * absent. Only if that throws the "cannot change name of view column" class of
 * error (a column-set change, which `CREATE OR REPLACE` forbids) do we fall back
 * to DROP + CREATE. No DB object depends on the view, so the DROP fallback is
 * safe; but the common column-preserving redeploy now never drops the view — it
 * matters once 12-4 reads the physical view.
 *
 * Canonical pg.Pool path (the `postgres` package is NOT a project dep).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-registry-unified-view-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGISTRY_UNIFIED_SQL_TEXT,
  REGISTRY_UNIFIED_VIEW_NAME,
} from '../src/services/registry-unified.sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-registry-unified-view-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-registry-unified-view-init] Starting Story 13-33 registry_unified view...');

  // The view IS the canonical service SQL — imported, never re-typed here.
  // Prefer CREATE OR REPLACE (atomic, no no-view window). Fall back to DROP +
  // CREATE only when the column set changed (CREATE OR REPLACE rejects that).
  try {
    await pool.query(
      `CREATE OR REPLACE VIEW "${REGISTRY_UNIFIED_VIEW_NAME}" AS ${REGISTRY_UNIFIED_SQL_TEXT};`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Postgres rejects a rename/drop/retype of an existing view column with
    // "cannot change name of view column ...". Only then is a recreate required.
    if (/cannot (change|drop|add).*view column|cannot change data type of view column/i.test(message)) {
      console.warn(
        `[migrate-registry-unified-view-init] column set changed — DROP + CREATE (${message})`,
      );
      await pool.query(`DROP VIEW IF EXISTS "${REGISTRY_UNIFIED_VIEW_NAME}";`);
      await pool.query(
        `CREATE VIEW "${REGISTRY_UNIFIED_VIEW_NAME}" AS ${REGISTRY_UNIFIED_SQL_TEXT};`,
      );
    } else {
      throw err;
    }
  }
  console.log(`[migrate-registry-unified-view-init] ✓ ${REGISTRY_UNIFIED_VIEW_NAME} view ensured.`);

  // Sanity: the view is queryable and returns the respondent count.
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "${REGISTRY_UNIFIED_VIEW_NAME}";`,
  );
  console.log(
    `[migrate-registry-unified-view-init] ✓ ${REGISTRY_UNIFIED_VIEW_NAME} rows: ${res.rows[0]?.n ?? '?'}`,
  );

  console.log('[migrate-registry-unified-view-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-registry-unified-view-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

/**
 * Custom SQL (triggers / GIN indexes) — idempotent runner.
 *
 * Story 13-38 [AI-Review][High] 2026-08-18. `apps/api/src/db/custom-sql/*.sql`
 * holds the DB objects Drizzle cannot express — today the `marketplace_profiles`
 * FTS trigger + its GIN index. They were reachable ONLY through the manual
 * `pnpm --filter @oslsr/api db:custom`, which appears in NO workflow and NO
 * deploy step. So every change to that SQL shipped as dead code:
 *
 *   - CI test-api runs `db:push:full:force` → the trigger never exists → the
 *     13-38 real-DB smoke (`finds a worker by their business name in full-text
 *     search`) FAILS, because search matches on
 *     `mp.search_vector @@ plainto_tsquery` as a hard WHERE filter.
 *   - Prod runs `db:push` + explicit `migrate-*-init.ts` steps → the trigger keeps
 *     whatever definition it had when someone last ran db:custom BY HAND (Story
 *     7-1, 2026-03). A business_name added at weight A would never enter the
 *     tsvector, making the card's headline line the one string search cannot find.
 *
 * This runner re-applies EVERY file in `src/db/custom-sql/` — it does not re-type
 * the SQL, it reads the same files `db:custom` reads, so there is exactly one
 * source of truth. Every file is written CREATE OR REPLACE / DROP IF EXISTS, so
 * re-running on each deploy is a no-op when nothing changed.
 *
 * ⚠️ ORDERING (13-38 [AI-Review][High] #2): this must run BEFORE any backfill that
 * writes `business_name`. The trigger only recomputes `search_vector` on
 * INSERT/UPDATE, and the 13-38 card backfill is idempotent — a second run reports
 * `needsUpdate=0` and touches nothing. So rows written under a stale trigger keep a
 * stale vector forever. Deploy-time placement (before any operator-gated backfill)
 * is what makes that ordering structural instead of a comment. Recovery, if it ever
 * does go out of order, is in docs/runbooks/backfill-operator-residuals.md.
 *
 * Wired into:
 *   - Local + CI test DB: auto-discovered by `apps/api/scripts/db-push-full.ts`
 *     (matches the `migrate-*-init.ts` glob). CI test-api runs `db:push:full:force`.
 *   - Prod: explicit step in `.github/workflows/ci-cd.yml` deploy chain.
 *
 * Canonical pg.Pool path (the `postgres` package is NOT a project dep).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-custom-sql-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-custom-sql-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

/** The SAME directory `db:custom` applies — never a second copy of the SQL. */
const CUSTOM_SQL_DIR = path.resolve(__dirname, '../src/db/custom-sql');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  const files = readdirSync(CUSTOM_SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.warn('[migrate-custom-sql-init] No .sql files found; nothing to apply.');
    return;
  }

  console.log(`[migrate-custom-sql-init] Applying ${files.length} custom SQL file(s)...`);

  for (const file of files) {
    const sqlText = readFileSync(path.join(CUSTOM_SQL_DIR, file), 'utf-8');
    await pool.query(sqlText);
    console.log(`[migrate-custom-sql-init]   ✓ ${file}`);
  }

  // Sanity: prove the marketplace FTS trigger is actually installed, and that its
  // definition carries business_name (Story 13-38 AC8). A silent "applied" that
  // left the old definition in place is the failure this runner exists to stop.
  const fn = await pool.query<{ def: string }>(
    `SELECT pg_get_functiondef(oid) AS def
       FROM pg_proc
      WHERE proname = 'update_marketplace_search_vector'`,
  );
  if (fn.rows.length === 0) {
    throw new Error('update_marketplace_search_vector missing after applying custom SQL');
  }
  console.log(
    `[migrate-custom-sql-init] ✓ FTS trigger installed; indexes business_name: ${fn.rows[0].def.includes('business_name')}`,
  );

  console.log('[migrate-custom-sql-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-custom-sql-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

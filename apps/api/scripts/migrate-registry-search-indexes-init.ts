/**
 * Story 9-56 — Registry search-at-scale indexes (idempotent migration runner).
 *
 * Story 9-56 widened the registry search (`RespondentService.listRespondents`)
 * to resolve a registrant by Reference ID / email / phone in addition to
 * name / NIN. To keep that search fast as the registry grows, the search is
 * resolved in two phases (see `respondent.service.ts`):
 *   Phase 1 — resolve matching respondent ids via indexed predicates;
 *   Phase 2 — the main query filters `r.id = ANY(ids)` (PK + nested-loop join).
 *
 * Phase 1 needs these indexes to avoid a cross-table OR sequential scan
 * (measured on a 500K-respondent / 1M-submission dataset: ~0.6-1.7s seq-scan
 * → <1ms with these indexes). db:push / Drizzle 0.45 cannot express GIN
 * trigram or expression indexes inline, so they live here.
 *
 * Indexes:
 *   - `idx_submissions_lower_email`         — expression index on
 *     `lower(raw_data->>'email')`; makes the email-resolution branch an index
 *     scan instead of a 1M-row JSON seq scan.
 *   - `idx_respondents_{first_name,last_name,phone_number,nin}_trgm` — GIN
 *     trigram indexes so the `ILIKE '%term%'` / `LIKE 'term%'` name/phone/NIN
 *     branches become BitmapOr index scans (sargable substring match).
 *
 * pg_trgm is already enabled in production by
 * `migrate-audit-principal-dualism-init.ts` (Story 9-11). We re-ensure it here
 * (idempotent) so this runner is self-contained, and degrade gracefully if the
 * deploy user lacks superuser (the search still WORKS via the same predicates —
 * it just falls back to seq scans, which are fine at production scale of a few
 * hundred rows; the trigram acceleration only matters at large volumes).
 *
 * Wired into:
 *   - Local: auto-discovered by `apps/api/scripts/db-push-full.ts`
 *     (matches the `migrate-*-init.ts` glob). `pnpm --filter @oslsr/api db:push:full`.
 *   - CI: explicit step in `.github/workflows/ci-cd.yml` deploy chain.
 *
 * Canonical pg.Pool path (the `postgres` package is NOT a project dep — F14).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-registry-search-indexes-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-registry-search-indexes-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-registry-search-indexes-init] Starting Story 9-56 registry search indexes...');

  // 1. Expression index on lower(raw_data->>'email') — email resolution branch.
  //    Not trigram (exact case-insensitive match), so a plain btree on the
  //    lowered expression is the right shape and the smallest index.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_submissions_lower_email"
      ON "submissions" (lower("raw_data"->>'email'));
  `);
  console.log('[migrate-registry-search-indexes-init] ✓ idx_submissions_lower_email ensured.');

  // 2. pg_trgm + GIN trigram indexes for the fuzzy name/phone/NIN branches.
  //    Already enabled by the Story 9-11 runner in production; re-ensure +
  //    degrade gracefully if the deploy user lacks superuser.
  let pgTrgmAvailable = false;
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    pgTrgmAvailable = true;
    console.log('[migrate-registry-search-indexes-init] ✓ pg_trgm extension ensured.');
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.warn(`[migrate-registry-search-indexes-init] ⚠ Could not CREATE EXTENSION pg_trgm: ${msg}`);
    console.warn('[migrate-registry-search-indexes-init] ⚠ Registry search still works (seq-scan fallback); trigram acceleration skipped.');
    console.warn('[migrate-registry-search-indexes-init] ⚠ Operator escalation (only needed at large scale):');
    console.warn('[migrate-registry-search-indexes-init] ⚠   docker exec oslsr_postgres psql -U postgres -d app_db -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"');
  }

  if (pgTrgmAvailable) {
    for (const [col, idx] of [
      ['first_name', 'idx_respondents_first_name_trgm'],
      ['last_name', 'idx_respondents_last_name_trgm'],
      ['phone_number', 'idx_respondents_phone_trgm'],
      ['nin', 'idx_respondents_nin_trgm'],
    ] as const) {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS "${idx}"
          ON "respondents" USING GIN ("${col}" gin_trgm_ops);
      `);
      console.log(`[migrate-registry-search-indexes-init] ✓ ${idx} GIN index ensured.`);
    }
  }

  console.log('[migrate-registry-search-indexes-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-registry-search-indexes-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

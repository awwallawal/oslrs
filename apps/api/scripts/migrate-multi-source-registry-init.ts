/**
 * Story 11-1 — Multi-Source Registry migration runner.
 *
 * Idempotent companion to `apps/api/drizzle/0010_multi_source_registry.sql`.
 * Drizzle's `db:push` handles the bulk of the schema (table creation, column
 * adds, index adds, FK relation, NOT NULL drop, legacy UNIQUE drop) but does
 * NOT express:
 *   1. The `respondents_status_check` CHECK constraint
 *   2. The `respondents_nin_unique_when_present` PARTIAL UNIQUE index
 *
 * This runner applies both idempotently after `db:push`. Wired into
 * `.github/workflows/ci-cd.yml` deploy step alongside the existing
 * `migrate-audit-immutable.ts` / `migrate-mfa-init.ts` /
 * `migrate-input-sanitisation-init.ts` runners.
 *
 * Pattern matches `migrate-input-sanitisation-init.ts` (canonical pg.Pool path
 * — `postgres` package is NOT a project dep; previous F14 footgun captured in
 * MEMORY.md).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-multi-source-registry-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-multi-source-registry-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-multi-source-registry-init] Starting Story 11-1 migration...');

  // 1. Drop any legacy NIN unique constraint that survived db:push. Two possible
  //    names depending on how the original 0002 migration registered the
  //    constraint: `respondents_nin_key` (Postgres default for inline UNIQUE)
  //    or `respondents_nin_unique` (Drizzle-managed `.unique()` modifier).
  //    Idempotent — only drops if present and only if the partial unique index
  //    we are about to create is NOT yet in place (defensive: we never want
  //    a window where NIN uniqueness is unenforced).
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'respondents'
          AND indexname = 'respondents_nin_unique_when_present'
      ) THEN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'respondents_nin_key'
            AND conrelid = 'respondents'::regclass
        ) THEN
          ALTER TABLE "respondents" DROP CONSTRAINT "respondents_nin_key";
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'respondents_nin_unique'
            AND conrelid = 'respondents'::regclass
        ) THEN
          ALTER TABLE "respondents" DROP CONSTRAINT "respondents_nin_unique";
        END IF;
      END IF;
    END $$;
  `);

  // 2. Status CHECK constraint — idempotent. Limits respondents.status to the
  //    four enumerated values defined in respondentStatusTypes.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'respondents_status_check'
          AND conrelid = 'respondents'::regclass
      ) THEN
        ALTER TABLE "respondents"
          ADD CONSTRAINT "respondents_status_check"
            CHECK (status IN ('active', 'pending_nin_capture', 'nin_unavailable', 'imported_unverified'));
      END IF;
    END $$;
  `);

  console.log('[migrate-multi-source-registry-init] ✓ respondents_status_check constraint ensured.');

  // 3. Partial unique index on NIN — idempotent. FR21 stays in force for every
  //    NIN-carrying row. Rows without NIN (status='pending_nin_capture',
  //    imported rows that lacked NIN) do not collide.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "respondents_nin_unique_when_present"
      ON "respondents" ("nin")
      WHERE "nin" IS NOT NULL;
  `);

  console.log('[migrate-multi-source-registry-init] ✓ respondents_nin_unique_when_present partial unique index ensured.');

  // 4. Status CHECK constraint on import_batches — idempotent. Mirrors the
  //    `respondents_status_check` pattern above. Drizzle's `text('status',
  //    { enum: importBatchStatusTypes })` only types the TypeScript surface;
  //    it does NOT generate a Postgres CHECK. Without this, raw SQL writes
  //    or drift from the Drizzle layer could insert an invalid status value.
  //    M1 (code-review 2026-05-03) — add to close the inconsistency.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'import_batches_status_check'
          AND conrelid = 'import_batches'::regclass
      ) THEN
        ALTER TABLE "import_batches"
          ADD CONSTRAINT "import_batches_status_check"
            CHECK (status IN ('active', 'rolled_back'));
      END IF;
    END $$;
  `);

  console.log('[migrate-multi-source-registry-init] ✓ import_batches_status_check constraint ensured.');

  // 5. Composite index on submissions(enumerator_id, submitted_at). Added by
  //    Story 11-1's AC#11 EXPLAIN audit (Akintola-risk Move 1) when the
  //    Epic 5.6a productivity-aggregation query (`enumerator_id = $1 AND
  //    submitted_at >= $2 AND submitted_at < $3 GROUP BY enumerator_id,
  //    DATE(submitted_at)`) tripped the AC#11 cost-<10,000 threshold at 1M
  //    submissions (cost was 14,453 with only the single-column indexes). The
  //    composite collapses scan + sort + group into a streaming aggregate.
  //    Useful for Story 5.6a (already shipped) AND Story 11-1's submission
  //    lineage queries.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_submissions_enumerator_submitted_at"
      ON "submissions" ("enumerator_id", "submitted_at");
  `);

  console.log('[migrate-multi-source-registry-init] ✓ idx_submissions_enumerator_submitted_at composite index ensured.');
  console.log('[migrate-multi-source-registry-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-multi-source-registry-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

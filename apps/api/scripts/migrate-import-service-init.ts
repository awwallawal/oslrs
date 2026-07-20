/**
 * Story 11-2 — Import Service migration runner.
 *
 * Idempotent companion to Drizzle `db:push` for the import service. `db:push`
 * creates the `import_batch_drafts` table (from the Drizzle schema) and adds the
 * new `respondents.status` enum value at the TypeScript layer, but it does NOT
 * update the Postgres CHECK constraint that Story 11-1 installed via
 * `migrate-multi-source-registry-init.ts`. That constraint still pins
 * `respondents.status` to the original four values and would REJECT a
 * `rolled_back` write.
 *
 * This runner extends `respondents_status_check` to include `rolled_back`,
 * idempotently: it only drops + recreates the constraint if the current
 * definition does not already permit `rolled_back`. Wire alongside the existing
 * migrate-*-init.ts runners in the deploy step (.github/workflows/ci-cd.yml).
 *
 * Pattern matches `migrate-multi-source-registry-init.ts` (canonical pg.Pool
 * path — `postgres` package is NOT a project dep; F14 footgun in MEMORY.md).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-import-service-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-import-service-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

// The full status enum after Story 11-2 (mirrors respondentStatusTypes).
const STATUS_VALUES = [
  'active',
  'pending_nin_capture',
  'nin_unavailable',
  'imported_unverified',
  'rolled_back',
];

async function run(): Promise<void> {
  console.log('[migrate-import-service-init] Starting Story 11-2 migration...');

  // Extend respondents_status_check to include `rolled_back`. Idempotent: the
  // DROP + ADD only fires when the live constraint definition does not already
  // mention `rolled_back`. Existing rows all satisfy the widened set, so the
  // re-ADD validates cleanly. If the constraint is somehow missing entirely
  // (fresh DB where db:push never ran the 11-1 runner), the ADD still installs
  // the correct 5-value CHECK.
  const inList = STATUS_VALUES.map((v) => `'${v}'`).join(', ');
  await pool.query(`
    DO $$
    DECLARE
      def text;
    BEGIN
      SELECT pg_get_constraintdef(oid) INTO def
      FROM pg_constraint
      WHERE conname = 'respondents_status_check'
        AND conrelid = 'respondents'::regclass;

      IF def IS NULL THEN
        ALTER TABLE "respondents"
          ADD CONSTRAINT "respondents_status_check"
            CHECK (status IN (${inList}));
      ELSIF position('rolled_back' in def) = 0 THEN
        ALTER TABLE "respondents" DROP CONSTRAINT "respondents_status_check";
        ALTER TABLE "respondents"
          ADD CONSTRAINT "respondents_status_check"
            CHECK (status IN (${inList}));
      END IF;
    END $$;
  `);

  console.log('[migrate-import-service-init] ✓ respondents_status_check now permits rolled_back.');
  console.log('[migrate-import-service-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-import-service-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

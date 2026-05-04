/**
 * Story 9-11 — Audit Log Principal Dualism migration runner (Schema Down Payment).
 *
 * Idempotent companion to the Drizzle schema additions in:
 *   - apps/api/src/db/schema/api-consumers.ts (new table — db:push handles)
 *   - apps/api/src/db/schema/audit.ts (consumer_id column add — db:push handles)
 *
 * What this runner adds that db:push cannot:
 *   1. `audit_logs_principal_exclusive_check` — CHECK constraint enforcing
 *      Architecture Decision 5.4 (principal dualism): a single audit row
 *      represents EITHER a human-user principal (actor_id set) OR a machine-
 *      consumer principal (consumer_id set) OR a system event (both NULL),
 *      never both human and machine simultaneously. Drizzle 0.45 cannot
 *      express CHECK constraints inline.
 *   2. `api_consumers_status_check` — CHECK constraint mirroring the
 *      `apiConsumerStatuses` enum in the Drizzle schema. Drizzle's
 *      `text('status', { enum: ... })` only types the TypeScript surface;
 *      raw SQL writes or schema drift could otherwise insert invalid status
 *      values (Pitfall #28). Pattern matches respondents_status_check from
 *      Story 11-1.
 *   3. `api_consumers_organisation_type_check` — CHECK constraint mirroring
 *      the `apiConsumerOrganisationTypes` enum. Same Drizzle limitation.
 *
 * Wired into:
 *   - Local: auto-discovered by `apps/api/scripts/db-push-full.ts` (matches
 *     migrate-*-init.ts glob). Run via `pnpm --filter @oslsr/api db:push:full`.
 *   - CI: explicit step in `.github/workflows/ci-cd.yml` deploy chain.
 *
 * Pattern matches `migrate-multi-source-registry-init.ts` (Story 11-1) and
 * `migrate-input-sanitisation-init.ts` (prep-input-sanitisation-layer):
 * canonical pg.Pool path — `postgres` package is NOT a project dep
 * (previous F14 footgun captured in MEMORY.md).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-audit-principal-dualism-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-audit-principal-dualism-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

/**
 * R2-L2: track per-step failure so the runner exits with non-zero on any
 * critical failure. The previous version always exited 0 even when a step
 * threw inside the run() body that wasn't caught at top-level (e.g. pg_trgm
 * permission denial caught inside its own try/catch but not surfaced to the
 * exit code). Critical-step failure now flips this flag; the finally-handler
 * at the bottom of the script reads it and emits the appropriate exit code.
 * CI (`.github/workflows/ci-cd.yml`) gates the deploy chain on a non-zero
 * exit so any silent degradation surfaces as a deploy failure rather than
 * a slow-prod mystery.
 */
let hasCriticalFailures = false;

async function run(): Promise<void> {
  console.log('[migrate-audit-principal-dualism-init] Starting Story 9-11 schema-down-payment migration...');

  // 1. Principal-exclusive CHECK on audit_logs (Architecture Decision 5.4).
  //    Either actor_id is NULL or consumer_id is NULL — both can be NULL
  //    (system event) but at most one can be set. Idempotent.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'audit_logs_principal_exclusive_check'
          AND conrelid = 'audit_logs'::regclass
      ) THEN
        ALTER TABLE "audit_logs"
          ADD CONSTRAINT "audit_logs_principal_exclusive_check"
            CHECK (("actor_id" IS NULL) OR ("consumer_id" IS NULL));
      END IF;
    END $$;
  `);

  console.log('[migrate-audit-principal-dualism-init] ✓ audit_logs_principal_exclusive_check constraint ensured.');

  // 2. Status CHECK on api_consumers — idempotent.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'api_consumers_status_check'
          AND conrelid = 'api_consumers'::regclass
      ) THEN
        ALTER TABLE "api_consumers"
          ADD CONSTRAINT "api_consumers_status_check"
            CHECK (status IN ('active', 'suspended', 'terminated'));
      END IF;
    END $$;
  `);

  console.log('[migrate-audit-principal-dualism-init] ✓ api_consumers_status_check constraint ensured.');

  // 3. Organisation-type CHECK on api_consumers — idempotent.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'api_consumers_organisation_type_check'
          AND conrelid = 'api_consumers'::regclass
      ) THEN
        ALTER TABLE "api_consumers"
          ADD CONSTRAINT "api_consumers_organisation_type_check"
            CHECK (organisation_type IN ('federal_mda', 'state_mda', 'research_institution', 'other'));
      END IF;
    END $$;
  `);

  console.log('[migrate-audit-principal-dualism-init] ✓ api_consumers_organisation_type_check constraint ensured.');

  // 4. Composite indexes for audit log viewer queries (AC#10).
  //
  // Two of the four are PARTIAL indexes (WHERE … IS NOT NULL) — Drizzle 0.45
  // cannot express partial indexes inline, so they live here. The remaining
  // two (target_resource + target_id, action) are non-partial composites; we
  // keep them in this same script for symmetry — all four belong to the
  // same AC and the same story; splitting them across schema + migrate-init
  // would obscure intent.
  //
  // DESC on created_at matches the audit log viewer's default sort order
  // (most-recent-first). Postgres uses descending leaf scans efficiently
  // when the query's ORDER BY matches the index ordering.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_created_at"
      ON "audit_logs" ("actor_id", "created_at" DESC)
      WHERE "actor_id" IS NOT NULL;
  `);
  console.log('[migrate-audit-principal-dualism-init] ✓ idx_audit_logs_actor_created_at partial index ensured.');

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_audit_logs_consumer_created_at"
      ON "audit_logs" ("consumer_id", "created_at" DESC)
      WHERE "consumer_id" IS NOT NULL;
  `);
  console.log('[migrate-audit-principal-dualism-init] ✓ idx_audit_logs_consumer_created_at partial index ensured.');

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_audit_logs_target_created_at"
      ON "audit_logs" ("target_resource", "target_id", "created_at" DESC);
  `);
  console.log('[migrate-audit-principal-dualism-init] ✓ idx_audit_logs_target_created_at composite index ensured.');

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_audit_logs_action_created_at"
      ON "audit_logs" ("action", "created_at" DESC);
  `);
  console.log('[migrate-audit-principal-dualism-init] ✓ idx_audit_logs_action_created_at composite index ensured.');

  // 5. pg_trgm extension + trigram GIN indexes for principal autocomplete (AC#9
  //    `principals/search?q=...`). Trigram index makes `ILIKE '%query%'`
  //    substring match microsecond-fast at any user/consumer table size.
  //
  //    `CREATE EXTENSION` requires superuser. On a fresh local Postgres the
  //    `user` user IS superuser; on production VPS the deploy user may not be.
  //    Handle permission denial gracefully: log a clear escalation message and
  //    continue. Indexes also fail silently since they depend on the extension
  //    — the autocomplete endpoint falls back to plain `ILIKE` (no GIN
  //    acceleration) which is still fine at our scale (low-thousand rows).
  //
  //    Operator escalation path (only needed if the `WARNING` below fires):
  //      docker exec oslsr_postgres psql -U postgres -d app_db -c \\
  //        "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
  let pgTrgmAvailable = false;
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    pgTrgmAvailable = true;
    console.log('[migrate-audit-principal-dualism-init] ✓ pg_trgm extension ensured.');
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(
      `[migrate-audit-principal-dualism-init] ✗ Could not CREATE EXTENSION pg_trgm: ${msg}`
    );
    console.error(
      '[migrate-audit-principal-dualism-init] ✗ Operator must run as superuser:'
    );
    console.error(
      '[migrate-audit-principal-dualism-init] ✗   docker exec oslsr_postgres psql -U postgres -d app_db -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"'
    );
    console.error(
      '[migrate-audit-principal-dualism-init] ✗ Audit log autocomplete will use plain ILIKE fallback until extension is enabled.'
    );
    // R2-L2: pg_trgm is a critical step. Without it, the AC#9 principal
    // autocomplete falls back to plain ILIKE which scales poorly. Mark the
    // failure so the script exits non-zero and CI / operator notices.
    hasCriticalFailures = true;
  }

  if (pgTrgmAvailable) {
    // GIN trigram indexes on the columns hit by AC#9 principal autocomplete.
    // Idempotent. Each index costs ~10-50 ms at table sizes < 10k rows.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_full_name_trgm"
        ON "users" USING GIN ("full_name" gin_trgm_ops);
    `);
    console.log('[migrate-audit-principal-dualism-init] ✓ idx_users_full_name_trgm GIN index ensured.');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "idx_api_consumers_name_trgm"
        ON "api_consumers" USING GIN ("name" gin_trgm_ops);
    `);
    console.log('[migrate-audit-principal-dualism-init] ✓ idx_api_consumers_name_trgm GIN index ensured.');
  }

  console.log('[migrate-audit-principal-dualism-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-audit-principal-dualism-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    // R2-L2: surface critical-step failure (e.g. pg_trgm permission denial)
    // even if the catch above didn't fire. CI gates on this exit code per
    // .github/workflows/ci-cd.yml.
    if (hasCriticalFailures && (process.exitCode ?? 0) === 0) {
      console.error(
        '[migrate-audit-principal-dualism-init] One or more critical steps failed (see ✗ messages above). Exiting non-zero to fail the deploy.'
      );
      process.exitCode = 1;
    }
  });

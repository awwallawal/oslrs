/**
 * Story 9-38 — `respondents.user_id` FK + index (idempotent runner).
 *
 * Story 9-38 provisions a passwordless `public_user` at wizard submit and links
 * the respondent to its account via a NEW `respondents.user_id` FK. The COLUMN
 * is created by Drizzle / `db:push` (declared in `db/schema/respondents.ts`),
 * and Drizzle CAN express the `ON DELETE SET NULL` reference inline — but, as
 * with the other init-runners, we make the migration self-contained +
 * idempotent so it converges regardless of db:push ordering or a partial prior
 * deploy:
 *   - ADD COLUMN IF NOT EXISTS user_id uuid
 *   - ADD the FK constraint (ON DELETE SET NULL) guarded by a pg_constraint
 *     existence check (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`)
 *   - CREATE INDEX IF NOT EXISTS idx_respondents_user_id
 *
 * `ON DELETE SET NULL` is load-bearing: erasing/deleting an account must NOT
 * cascade-delete the respondent's survey data (9-26 unified-ingestion lesson).
 *
 * Wired into:
 *   - Local: auto-discovered by `apps/api/scripts/db-push-full.ts`
 *     (matches the `migrate-*-init.ts` glob). `pnpm --filter @oslsr/api db:push:full`.
 *   - CI: explicit step in `.github/workflows/ci-cd.yml` deploy chain.
 *
 * Canonical pg.Pool path (the `postgres` package is NOT a project dep).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-respondents-user-id-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-respondents-user-id-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

const FK_NAME = 'respondents_user_id_users_id_fk';

async function run(): Promise<void> {
  console.log('[migrate-respondents-user-id-init] Starting Story 9-38 respondents.user_id FK...');

  // 1. Column — TEXT/UUID nullable. Defensive: ensure it exists even if this
  //    runner happens to run before db:push has applied the schema.
  await pool.query(`
    ALTER TABLE "respondents"
      ADD COLUMN IF NOT EXISTS "user_id" uuid;
  `);
  console.log('[migrate-respondents-user-id-init] ✓ respondents.user_id column ensured.');

  // 2. FK constraint with ON DELETE SET NULL — guarded (no ADD CONSTRAINT IF
  //    NOT EXISTS in Postgres). Match the Drizzle-generated constraint name so
  //    db:push recognises it and never tries to recreate/drop it.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${FK_NAME}'
      ) THEN
        ALTER TABLE "respondents"
          ADD CONSTRAINT "${FK_NAME}"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);
  console.log('[migrate-respondents-user-id-init] ✓ FK respondents.user_id → users.id (ON DELETE SET NULL) ensured.');

  // 3. Lookup index for the read-model + downstream consumers (Story 9-32).
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_respondents_user_id"
      ON "respondents" ("user_id");
  `);
  console.log('[migrate-respondents-user-id-init] ✓ idx_respondents_user_id ensured.');

  console.log('[migrate-respondents-user-id-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-respondents-user-id-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

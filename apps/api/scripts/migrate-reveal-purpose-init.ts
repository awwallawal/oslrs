/**
 * Story 9-41 AC#6 — contact_reveals purpose-binding migration runner.
 *
 * Idempotent companion to the Drizzle schema change in
 * `src/db/schema/contact-reveals.ts` (adds `purpose` + `tos_accepted_at`).
 * `db:push:force` handles the column add in CI; this hand-rolled runner makes
 * the change safe to apply directly on prod and re-runnable (ADD COLUMN IF NOT
 * EXISTS), per the story's "hand-rolled idempotent migration" requirement.
 *
 * Both columns are NULLABLE: existing reveal rows (and all below-threshold
 * reveals) carry NULL — only reveals above the configured per-viewer volume
 * threshold persist a purpose + ToS acceptance timestamp.
 *
 * Wired into `.github/workflows/ci-cd.yml` deploy step alongside the other
 * migrate-*-init.ts runners. Runs AFTER db:push.
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-reveal-purpose-init.ts
 *
 * Uses the `pg` package (already an apps/api dep) with raw SQL — matches the
 * working migrate-mfa-init.ts / migrate-audit-immutable.ts pattern (the
 * `postgres` package is NOT a project dep — see migrate-mfa-init.ts F14 note).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-reveal-purpose-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-reveal-purpose-init] Starting Story 9-41 AC#6 purpose-binding migration...');

  await pool.query(`
    ALTER TABLE contact_reveals
      ADD COLUMN IF NOT EXISTS purpose TEXT;
  `);
  console.log('[migrate-reveal-purpose-init] ✓ contact_reveals.purpose ensured.');

  await pool.query(`
    ALTER TABLE contact_reveals
      ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;
  `);
  console.log('[migrate-reveal-purpose-init] ✓ contact_reveals.tos_accepted_at ensured.');

  console.log('[migrate-reveal-purpose-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-reveal-purpose-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

/**
 * Story 9-13 — MFA initialization migration runner.
 *
 * Idempotent companion to `apps/api/drizzle/0008_add_mfa_columns.sql`.
 * Drizzle's `db:push` handles the column / table additions; this script
 * handles the items the diff cannot express idiomatically:
 *
 *   1. Partial index `idx_user_backup_codes_unused` ON user_backup_codes
 *      (user_id, used_at) WHERE used_at IS NULL — used by atomic backup-code
 *      redemption to win the race when two requests submit the same code.
 *
 *   2. Seed `mfa_grace_until = NOW() + interval '7 days'` for every active
 *      super_admin row whose grace_until is currently NULL (AC#5a).
 *      Idempotent: only updates rows where grace_until IS NULL, so re-runs
 *      after the first invocation are no-ops for already-seeded users.
 *
 * Wired into `.github/workflows/ci-cd.yml` deploy step alongside the existing
 * `migrate-audit-immutable.ts` runner. Runs AFTER `db:push`.
 *
 * Local invocation: `pnpm --filter @oslsr/api exec tsx scripts/migrate-mfa-init.ts`
 *
 * F14 (cross-story fix from prep-input-sanitisation code-review 2026-05-02):
 * uses `pg` package (already in apps/api deps) instead of the `postgres`
 * package which was NOT a project dep. Original implementation imported
 * `import postgres from 'postgres'` and crashed at runtime in CI deploy:
 *   ERR_MODULE_NOT_FOUND: Cannot find package 'postgres'
 * Story 9-13's Dev Agent Record DID flag this ("import-of-postgres package
 * broken on local; applied via tsx one-shot using existing pg pool") but
 * never fixed the underlying script — so every deploy after Story 9-13's
 * commit silently failed at the migrate-mfa-init step. Pattern now matches
 * the working migrate-audit-immutable.ts (pg.Pool with raw SQL strings).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-mfa-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-mfa-init] Starting Story 9-13 MFA init migration...');

  // 1. Partial index for fast unused-backup-code lookups.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_backup_codes_unused
      ON user_backup_codes (user_id, used_at)
      WHERE used_at IS NULL;
  `);
  console.log('[migrate-mfa-init] ✓ Partial index ensured.');

  // 2. Seed 7-day grace_until for active super_admins missing one.
  // Idempotent — only fires when grace_until IS NULL.
  const seeded = await pool.query<{ id: string; email: string }>(`
    UPDATE users
       SET mfa_grace_until = NOW() + interval '7 days'
     WHERE role_id IN (SELECT id FROM roles WHERE name = 'super_admin')
       AND status = 'active'
       AND mfa_grace_until IS NULL
       AND mfa_enabled = false
    RETURNING id, email
  `);

  const seededRows = seeded.rowCount ?? 0;
  if (seededRows > 0) {
    console.log(`[migrate-mfa-init] ✓ Seeded mfa_grace_until for ${seededRows} super_admin row(s):`);
    for (const row of seeded.rows) {
      console.log(`[migrate-mfa-init]   - ${row.email}`);
    }
  } else {
    console.log('[migrate-mfa-init] ✓ All active super_admins already have mfa_grace_until set (or are MFA-enabled). No-op.');
  }

  console.log('[migrate-mfa-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-mfa-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

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
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-mfa-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

async function run(): Promise<void> {
  console.log('[migrate-mfa-init] Starting Story 9-13 MFA init migration...');

  // 1. Partial index for fast unused-backup-code lookups.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_user_backup_codes_unused
      ON user_backup_codes (user_id, used_at)
      WHERE used_at IS NULL;
  `);
  console.log('[migrate-mfa-init] ✓ Partial index ensured.');

  // 2. Seed 7-day grace_until for active super_admins missing one.
  // Idempotent — only fires when grace_until IS NULL.
  const seeded = await db.execute(sql`
    UPDATE users
       SET mfa_grace_until = NOW() + interval '7 days'
     WHERE role_id IN (SELECT id FROM roles WHERE name = 'super_admin')
       AND status = 'active'
       AND mfa_grace_until IS NULL
       AND mfa_enabled = false
    RETURNING id, email;
  `);

  const seededRows = seeded.length ?? 0;
  if (seededRows > 0) {
    console.log(`[migrate-mfa-init] ✓ Seeded mfa_grace_until for ${seededRows} super_admin row(s):`);
    for (const row of seeded as Array<{ email: string }>) {
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
    await client.end();
  });

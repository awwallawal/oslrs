/**
 * prep-settings-landing-and-feature-flags — migration runner.
 *
 * Companion to `apps/api/drizzle/0011_create_system_settings.sql`. Drizzle's
 * `db:push` creates the `system_settings` table from the schema, but does NOT
 * seed rows. This runner inserts the initial `auth.sms_otp_enabled = false`
 * row idempotently (ON CONFLICT DO NOTHING) so AC#8 is satisfied at deploy
 * time without a separate operator step.
 *
 * Auto-discovered by `apps/api/scripts/db-push-full.ts` via the
 * `migrate-*-init.ts` glob; wired into `.github/workflows/ci-cd.yml` deploy
 * step alongside the other init runners. Runs AFTER `db:push`.
 *
 * Defensive: aborts cleanly if zero active super_admin rows exist (would
 * otherwise FK-violate). Production has 2 super_admin rows per MEMORY.md.
 *
 * Pattern matches `migrate-input-sanitisation-init.ts` (uses `pg.Pool` —
 * `postgres` package is NOT a project dep; F14 from 2026-05-02 review fixed
 * the same bug in the input-sanitisation runner).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-system-settings-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-system-settings-init] Starting prep-settings-landing seed...');

  // Find the first active super_admin (deterministic via ORDER BY created_at ASC).
  const adminResult = await pool.query<{ id: string }>(`
    SELECT u.id
    FROM users u
    INNER JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'super_admin' AND u.status = 'active'
    ORDER BY u.created_at ASC
    LIMIT 1
  `);

  if (adminResult.rows.length === 0) {
    // Truly non-fatal: the auto-discovery chain in scripts/db-push-full.ts
    // treats a non-zero exit code as fatal and aborts the whole pipeline.
    // CI's test_db has no super_admins by design, so we must exit 0 here
    // (no seed gets written; tests that need the seed already skip when
    // no super_admin is present — see system-settings.constraints.test.ts).
    // Production has 2 super_admins per MEMORY.md so this branch never
    // fires there; if it ever did, re-run after super_admin provisioning.
    console.warn('[migrate-system-settings-init] No active super_admin found; skipping seed (non-fatal).');
    console.warn('[migrate-system-settings-init] Re-run after super_admin is provisioned to write the auth.sms_otp_enabled seed row.');
    return;
  }

  const superAdminId = adminResult.rows[0].id;

  // Idempotent seed for `auth.sms_otp_enabled` (AC#8).
  await pool.query(
    `
    INSERT INTO "system_settings" (key, value, description, updated_by, updated_at, created_at)
    VALUES (
      $1,
      $2::jsonb,
      $3,
      $4,
      now(),
      now()
    )
    ON CONFLICT ("key") DO NOTHING
    `,
    [
      'auth.sms_otp_enabled',
      'false',
      'When true, SMS OTP becomes available for public-user auth (requires SMS provider configured).',
      superAdminId,
    ],
  );

  console.log('[migrate-system-settings-init] ✓ auth.sms_otp_enabled seed ensured.');

  // Story 9-12 Task 5.4.1 — idempotent seed for `wizard.public_form_id` (Option B
  // form-discovery: Super Admin pins which published form the public wizard
  // renders). Default value is JSONB null — wizard renders an empty-state
  // ("survey not yet available") until Super Admin sets a UUID via the
  // Settings landing page.
  await pool.query(
    `
    INSERT INTO "system_settings" (key, value, description, updated_by, updated_at, created_at)
    VALUES (
      $1,
      $2::jsonb,
      $3,
      $4,
      now(),
      now()
    )
    ON CONFLICT ("key") DO NOTHING
    `,
    [
      'wizard.public_form_id',
      'null',
      'UUID of the published questionnaire that the public registration wizard renders on Step 4. Null = wizard shows empty-state and skips Step 4.',
      superAdminId,
    ],
  );

  console.log('[migrate-system-settings-init] ✓ wizard.public_form_id seed ensured.');
  console.log('[migrate-system-settings-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-system-settings-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

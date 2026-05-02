/**
 * prep-input-sanitisation-layer — migration runner.
 *
 * Idempotent companion to `apps/api/drizzle/0009_respondents_normalisation_metadata.sql`.
 * Drizzle's `db:push` adds the `respondents.metadata` jsonb column from the schema
 * but does NOT apply the raw-SQL CHECK constraint. This runner applies the
 * `chk_respondents_phone_number_e164 NOT VALID` constraint idempotently so the
 * migration's AC#7 deliverable actually reaches production.
 *
 * Wired into `.github/workflows/ci-cd.yml` deploy step alongside the existing
 * `migrate-audit-immutable.ts` + `migrate-mfa-init.ts` runners. Runs AFTER `db:push`.
 *
 * Local invocation: `pnpm --filter @oslsr/api exec tsx scripts/migrate-input-sanitisation-init.ts`
 *
 * Note: this runner does NOT run the back-fill script — back-fill is operator-
 * gated (must run with `--dry-run` first, then operator decides). See
 * `docs/active-watches.md` for the operator runbook entry.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-input-sanitisation-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

async function run(): Promise<void> {
  console.log('[migrate-input-sanitisation-init] Starting prep-input-sanitisation-layer migration...');

  // CHECK constraint for phone E.164 — NOT VALID so legacy non-canonical rows
  // aren't immediately rejected. Operator runs the back-fill script + then
  // VALIDATE CONSTRAINT separately when ready.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_respondents_phone_number_e164'
          AND conrelid = 'respondents'::regclass
      ) THEN
        ALTER TABLE "respondents"
          ADD CONSTRAINT "chk_respondents_phone_number_e164"
            CHECK (phone_number IS NULL OR phone_number ~ '^\\+234\\d{10}$')
            NOT VALID;
      END IF;
    END $$;
  `);

  console.log('[migrate-input-sanitisation-init] ✓ chk_respondents_phone_number_e164 NOT VALID constraint ensured.');
  console.log('[migrate-input-sanitisation-init] Done.');
  console.log('[migrate-input-sanitisation-init]');
  console.log('[migrate-input-sanitisation-init] NEXT OPERATOR STEPS (post-deploy, manual):');
  console.log('[migrate-input-sanitisation-init]   1. SSH to VPS via Tailscale (ssh root@oslsr-home-app)');
  console.log('[migrate-input-sanitisation-init]   2. Run: pnpm --filter @oslsr/api exec tsx src/scripts/backfill-input-sanitisation.ts --dry-run');
  console.log('[migrate-input-sanitisation-init]   3. Review log output; if planned changes look correct, re-run without --dry-run.');
  console.log('[migrate-input-sanitisation-init]   4. Run: pnpm --filter @oslsr/api exec tsx src/scripts/report-backfill-failures.ts');
  console.log('[migrate-input-sanitisation-init]   5. If zero failures, optionally run: ALTER TABLE respondents VALIDATE CONSTRAINT chk_respondents_phone_number_e164;');
}

run()
  .catch((err) => {
    console.error('[migrate-input-sanitisation-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });

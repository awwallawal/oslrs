/**
 * Story 9-58 (Deliverable B) — reference-code UNIQUE index (idempotent runner).
 *
 * Story 9-58 adds `respondents.reference_code` (a human-friendly
 * `OSL-<YYYY>-<6 base32>` code, generated at respondent creation on every
 * channel). The COLUMN is created by Drizzle / `db:push` (it's declared in
 * `db/schema/respondents.ts`). This runner adds the UNIQUE index that backs
 * (a) the collision-retry uniqueness guarantee at generation time and (b) the
 * fast exact-match lookup the public status check + the 9-56 staff search use.
 *
 * Why an init-runner (not a Drizzle `uniqueIndex`): the column is nullable
 * (existing rows are backfilled lazily), and we want a single idempotent
 * `CREATE UNIQUE INDEX IF NOT EXISTS` that runs on every deploy without a
 * destructive `db:push` interaction — the same convention the GIN-trigram /
 * expression indexes follow (`migrate-registry-search-indexes-init.ts`).
 * Postgres treats NULLs as distinct, so the partial-ness is implicit: many
 * rows may have NULL `reference_code` while every NON-NULL value is unique.
 *
 * Wired into:
 *   - Local: auto-discovered by `apps/api/scripts/db-push-full.ts`
 *     (matches the `migrate-*-init.ts` glob). `pnpm --filter @oslsr/api db:push:full`.
 *   - CI: explicit step in `.github/workflows/ci-cd.yml` deploy chain.
 *
 * Canonical pg.Pool path (the `postgres` package is NOT a project dep).
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-reference-code-init.ts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-reference-code-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  console.log('[migrate-reference-code-init] Starting Story 9-58 reference-code index...');

  // Defensive: ensure the column exists even if a deploy runs this runner
  // before `db:push` has applied the schema (db:push runs first in CI, but
  // make the runner self-contained + idempotent). TEXT, nullable.
  await pool.query(`
    ALTER TABLE "respondents"
      ADD COLUMN IF NOT EXISTS "reference_code" text;
  `);
  console.log('[migrate-reference-code-init] ✓ respondents.reference_code column ensured.');

  // Duplicate pre-check — a partial prior deploy could have written
  // `reference_code` values BEFORE this UNIQUE index existed. If so, the
  // CREATE UNIQUE INDEX below fails with an opaque Postgres error and blocks
  // the deploy with zero guidance. Detect duplicates first and fail with a
  // clear, actionable message instead. (NULLs are distinct in Postgres and
  // excluded here, so unbackfilled rows never trip this guard.)
  const dupRes = await pool.query<{ reference_code: string; count: string }>(`
    SELECT "reference_code", COUNT(*) AS count
      FROM "respondents"
      WHERE "reference_code" IS NOT NULL
      GROUP BY "reference_code"
      HAVING COUNT(*) > 1;
  `);
  if (dupRes.rows.length > 0) {
    const dupGroups = dupRes.rows.length;
    const dupRows = dupRes.rows.reduce((sum, r) => sum + Number(r.count), 0);
    console.error(
      `[migrate-reference-code-init] ABORTING: found ${dupGroups} duplicate ` +
        `reference_code value(s) spanning ${dupRows} respondent row(s). ` +
        'The UNIQUE index cannot be created while duplicates exist.',
    );
    console.error(
      '[migrate-reference-code-init] Remediation: null out or re-mint the ' +
        'duplicate reference_code rows (keep one per code), then re-run this runner.',
    );
    process.exitCode = 1;
    return;
  }
  console.log('[migrate-reference-code-init] ✓ no duplicate reference_code values; safe to index.');

  // UNIQUE index — backs collision-retry generation + exact-match lookups.
  // NULLs are distinct in Postgres, so unbackfilled rows coexist freely.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_respondents_reference_code"
      ON "respondents" ("reference_code");
  `);
  console.log('[migrate-reference-code-init] ✓ idx_respondents_reference_code (UNIQUE) ensured.');

  console.log('[migrate-reference-code-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-reference-code-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

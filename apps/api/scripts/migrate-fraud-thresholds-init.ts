/**
 * Story 13-2 R-A2 review (2026-09-13) — converge NEW fraud-threshold rule keys onto an
 * already-seeded database. ADDITIVE ONLY.
 *
 * ⛔ WHY THIS EXISTS. R-A2 added three `roll_padding` tunables to
 * `FRAUD_THRESHOLD_DEFAULTS` and recorded them as "tunable without a deploy". On
 * production that was false, for two independent reasons:
 *   - `seedFraudThresholds` skips when ANY active threshold exists (it preserves
 *     manual config), and `FraudConfigService.bootstrapDefaultsIfTableEmpty` only
 *     fires on an EMPTY table. Production has had 27 rows since Epic 4, so neither
 *     path would ever insert the three new keys.
 *   - `FraudConfigService.updateThreshold` throws `No active threshold found for rule
 *     key` for a key with no row, so the admin UI could not tune them either.
 * The heuristic would have run on its hard-coded fallbacks forever, with no row to
 * edit — the calibration R-A8 hands to Awwal would have needed a code deploy.
 *
 * WHAT IT DOES. For every rule key in `FRAUD_THRESHOLD_DEFAULTS` that has NO row at
 * all (any version, active or not), insert the default as version 1. It never
 * updates, deactivates or re-versions an existing row, so tuned values survive every
 * deploy. A key that exists only as an inactive row was deliberately retired and is
 * left alone.
 *
 * ⛔ AN EMPTY TABLE IS LEFT EMPTY. Inserting three rows into an empty table would
 * make it non-empty, and `bootstrapDefaultsIfTableEmpty` would then never restore the
 * other 27 — this runner would have disabled every field heuristic's tuning while
 * trying to add three. The empty case belongs to the bootstrap.
 *
 * Auto-discovered by `scripts/db-push-full.ts` via the `migrate-*-init.ts` glob, and
 * wired into the `.github/workflows/ci-cd.yml` deploy step with the other runners.
 * Idempotent. Non-fatal (exit 0) when there is no super_admin, because CI's test_db
 * has none by design and the runner chain treats a non-zero exit as fatal.
 *
 * The thresholds cache (`fraud:thresholds:active`, 5-minute TTL) is not flushed: new
 * rows are picked up within the TTL, and nothing reads these keys until the R-A7
 * operator run, which is hours or days after a deploy.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAUD_THRESHOLD_DEFAULTS } from '../src/db/seeds/fraud-thresholds.seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const TAG = '[migrate-fraud-thresholds-init]';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`${TAG} DATABASE_URL not set; aborting.`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function run(): Promise<void> {
  const [{ total }] = (await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fraud_thresholds',
  )).rows;

  if (total === 0) {
    console.log(`${TAG} fraud_thresholds is EMPTY — leaving it to the bootstrap/seed (inserting a subset would block them). No-op.`);
    return;
  }

  const existing = new Set(
    (await pool.query<{ rule_key: string }>('SELECT DISTINCT rule_key FROM fraud_thresholds')).rows.map(
      (r) => r.rule_key,
    ),
  );
  const missing = FRAUD_THRESHOLD_DEFAULTS.filter((t) => !existing.has(t.ruleKey));

  if (missing.length === 0) {
    console.log(`${TAG} all ${FRAUD_THRESHOLD_DEFAULTS.length} default rule keys present. No-op.`);
    return;
  }

  const adminResult = await pool.query<{ id: string }>(`
    SELECT u.id
    FROM users u
    INNER JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'super_admin' AND u.status = 'active'
    ORDER BY u.created_at ASC
    LIMIT 1
  `);
  if (adminResult.rows.length === 0) {
    console.warn(`${TAG} ${missing.length} rule key(s) missing but no active super_admin for created_by; skipping (non-fatal).`);
    return;
  }
  const createdBy = adminResult.rows[0].id;

  let inserted = 0;
  for (const t of missing) {
    const res = await pool.query(
      `
      INSERT INTO fraud_thresholds
        (id, rule_key, display_name, rule_category, threshold_value, weight, severity_floor,
         version, is_active, effective_from, effective_until, created_by, notes, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1, true, now(), NULL, $7, $8, now())
      ON CONFLICT ON CONSTRAINT uq_fraud_thresholds_rule_key_version DO NOTHING
      `,
      [t.ruleKey, t.displayName, t.ruleCategory, t.thresholdValue, t.weight, t.severityFloor, createdBy, t.notes],
    );
    inserted += res.rowCount ?? 0;
    console.log(`${TAG} ${res.rowCount ? '✓ inserted' : '· already present'} ${t.ruleKey} = ${t.thresholdValue}`);
  }

  console.log(`${TAG} Done — ${inserted} of ${missing.length} missing rule key(s) inserted.`);
}

run()
  .catch((err) => {
    console.error(`${TAG} FAILED:`, err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

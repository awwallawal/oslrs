/**
 * Story 9-11 — AC#11 audit-viewer scale bench seeder.
 *
 * Seeds a SEPARATE bench database (`oslsr_bench`) with the projected scale
 * for the audit log viewer:
 *   - 10  users (covering 70% principal mix)
 *   - 3   api_consumers (covering 20% principal mix)
 *   - 1M  audit_logs (mix: 70% user, 20% consumer, 10% system)
 *
 * Why a separate bench DB (not app_db):
 *   The Story 11-1 seeder wiped 874 real audit_logs rows on 2026-05-03 because
 *   it ran against app_db and `--reset` truncated. This script avoids the
 *   problem entirely by isolating to `oslsr_bench`. Awwal's working `app_db`
 *   stays clean. Cleanup is `pnpm cleanup:audit-bench` (drops the bench DB).
 *
 * Usage:
 *   pnpm --filter @oslsr/api seed:audit-bench
 *   pnpm --filter @oslsr/api seed:audit-bench --rows=10000   # smoke
 *   pnpm --filter @oslsr/api seed:audit-bench --rows=1000000 # full (default)
 *
 * On first run, this script:
 *   1. Connects to the postgres-default DB to issue CREATE DATABASE oslsr_bench.
 *   2. Spawns drizzle-kit push against oslsr_bench to apply the Drizzle schema.
 *   3. Spawns each migrate-*-init.ts runner against oslsr_bench to apply CHECK
 *      constraints + indexes that drizzle-kit cannot express.
 *   4. Seeds users + api_consumers + audit_logs.
 *
 * Subsequent runs detect existing schema and skip steps 1-3.
 *
 * Idempotent: if audit_logs row count >= target, skip seed (use --reset to force).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { uuidv7 } from 'uuidv7';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(apiRoot, '../../.env') });

// ── Config ──────────────────────────────────────────────────────────────

const rootDatabaseUrl = process.env.DATABASE_URL;
if (!rootDatabaseUrl) {
  console.error('[seed-audit-bench] DATABASE_URL not set; aborting.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('[seed-audit-bench] NODE_ENV=production — refusing to run.');
  process.exit(1);
}

const lcUrl = rootDatabaseUrl.toLowerCase();
if (lcUrl.includes('prod') || lcUrl.includes('oyotrade') || lcUrl.includes('oyoskills')) {
  console.error('[seed-audit-bench] DATABASE_URL appears to point at production — refusing to run.');
  process.exit(1);
}

// Derive the bench DATABASE_URL by replacing the database name segment.
const BENCH_DB_NAME = 'oslsr_bench';
function deriveBenchUrl(rootUrl: string): string {
  // postgres://user:pass@host:port/<dbname>?...
  const url = new URL(rootUrl);
  url.pathname = `/${BENCH_DB_NAME}`;
  return url.toString();
}
function deriveAdminUrl(rootUrl: string): string {
  // Connect to 'postgres' DB to issue DDL on other databases.
  const url = new URL(rootUrl);
  url.pathname = '/postgres';
  return url.toString();
}
const benchDatabaseUrl = deriveBenchUrl(rootDatabaseUrl);
const adminDatabaseUrl = deriveAdminUrl(rootDatabaseUrl);

function parseInt10(s: string | undefined, dflt: number): number {
  if (!s) return dflt;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const TARGET_AUDIT_LOGS = parseInt10(getArg('rows'), 1_000_000);
const BATCH = parseInt10(getArg('batch'), 5_000);
const RESET = process.argv.includes('--reset');

// ── Spawn helper ────────────────────────────────────────────────────────

function runChild(cmd: string, args: string[], envOverrides: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[seed-audit-bench] $ ${cmd} ${args.join(' ')} (DATABASE_URL → oslsr_bench)`);
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      cwd: apiRoot,
      env: { ...process.env, ...envOverrides },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

// ── Schema bootstrap ────────────────────────────────────────────────────

async function ensureBenchDatabase(): Promise<void> {
  const adminPool = new pg.Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    const exists = await adminPool.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname = $1`,
      [BENCH_DB_NAME]
    );
    if (exists.rows.length > 0) {
      console.log(`[seed-audit-bench] ✓ Database '${BENCH_DB_NAME}' already exists.`);
      return;
    }
    // CREATE DATABASE cannot run inside a transaction block; pg.Pool runs each
    // query autocommit so this is fine.
    await adminPool.query(`CREATE DATABASE "${BENCH_DB_NAME}"`);
    console.log(`[seed-audit-bench] ✓ Created database '${BENCH_DB_NAME}'.`);
  } finally {
    await adminPool.end();
  }
}

async function applySchemaIfMissing(): Promise<boolean> {
  const benchPool = new pg.Pool({ connectionString: benchDatabaseUrl, max: 1 });
  let needsApply = false;
  try {
    const tableCheck = await benchPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
      ) AS exists`
    );
    needsApply = !tableCheck.rows[0].exists;
  } finally {
    await benchPool.end();
  }

  if (!needsApply) {
    console.log('[seed-audit-bench] ✓ Schema already applied.');
    return false;
  }

  console.log('[seed-audit-bench] Applying schema to bench DB (drizzle-kit push + 9-11 migrate-init only)...');
  await runChild('pnpm', ['exec', 'tsx', 'scripts/db-push.ts', '--force'], {
    DATABASE_URL: benchDatabaseUrl,
  });
  // Story 9-11 dualism + composite indexes + pg_trgm — needed for the bench queries.
  await runChild('pnpm', ['exec', 'tsx', 'scripts/migrate-audit-principal-dualism-init.ts'], {
    DATABASE_URL: benchDatabaseUrl,
  });
  // INTENTIONALLY skip migrate-audit-immutable.ts: it enforces NOT NULL on
  // audit_logs.hash after a hash-chain backfill, which would force the seeder
  // to compute SHA-256 hashes for 1M rows (substantially slower + irrelevant
  // to query-plan benchmarking). The append-only trigger from that runner
  // also blocks the --reset path. AC#11 is about index/plan behaviour at
  // scale, not hash-chain integrity (which is exercised by Story 6-1 tests).
  // Other migrate-init runners (mfa, multi-source-registry, input-sanitisation)
  // are not strictly needed either — their constraints don't touch the bench's
  // 3 working tables.
  return true;
}

// ── Seed helpers ────────────────────────────────────────────────────────

const ACTIONS = [
  'auth.login', 'auth.logout', 'auth.password_change',
  'pii.view_record', 'pii.view_list', 'pii.export_csv', 'pii.export_pdf',
  'pii.search', 'pii.contact_reveal',
  'data.create', 'data.update', 'data.delete',
  'admin.user_deactivate', 'admin.user_reactivate', 'admin.role_change',
  'system.backup', 'system.restore', 'system.migration',
  'audit_log.exported',
];
const TARGET_RESOURCES = [
  'respondents', 'submissions', 'users', 'fraud_detections',
  'marketplace_profiles', 'audit_logs', 'sessions', 'api_consumers',
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

async function ensureSeedRoles(pool: pg.Pool): Promise<string> {
  const existing = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1`);
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const id = uuidv7();
  await pool.query(
    `INSERT INTO roles (id, name, description) VALUES ($1, 'super_admin', 'Bench seeded super_admin') ON CONFLICT (name) DO NOTHING`,
    [id]
  );
  const real = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1`);
  return real.rows[0].id;
}

async function ensureSeedUsers(pool: pg.Pool, count: number, roleId: string): Promise<string[]> {
  const existing = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT $1`, [count]);
  if (existing.rows.length >= count) {
    return existing.rows.slice(0, count).map((r) => r.id);
  }
  const ids: string[] = existing.rows.map((r) => r.id);
  for (let i = ids.length; i < count; i++) {
    const id = uuidv7();
    await pool.query(
      `INSERT INTO users (id, email, full_name, role_id, status, password_hash)
       VALUES ($1, $2, $3, $4, 'active', 'x')
       ON CONFLICT (email) DO NOTHING`,
      [id, `bench-user-${i}@oslsr.test`, `Bench User ${i}`, roleId]
    );
    const real = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [`bench-user-${i}@oslsr.test`]
    );
    if (real.rows[0]) ids.push(real.rows[0].id);
  }
  return ids;
}

async function ensureSeedApiConsumers(pool: pg.Pool, count: number): Promise<string[]> {
  const existing = await pool.query<{ id: string }>(`SELECT id FROM api_consumers LIMIT $1`, [count]);
  if (existing.rows.length >= count) {
    return existing.rows.slice(0, count).map((r) => r.id);
  }
  const ids: string[] = existing.rows.map((r) => r.id);
  for (let i = ids.length; i < count; i++) {
    const id = uuidv7();
    const orgs = ['federal_mda', 'state_mda', 'research_institution'] as const;
    await pool.query(
      `INSERT INTO api_consumers (id, name, organisation_type, contact_email, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [id, `Bench Consumer ${i}`, orgs[i % orgs.length], `bench-consumer-${i}@oslsr.test`]
    );
    ids.push(id);
  }
  return ids;
}

async function seedAuditLogs(
  pool: pg.Pool,
  total: number,
  userIds: string[],
  consumerIds: string[]
): Promise<void> {
  const startedAt = Date.now();
  let inserted = 0;
  while (inserted < total) {
    const remaining = total - inserted;
    const size = Math.min(BATCH, remaining);
    const params: unknown[] = [];
    const valueRows: string[] = [];
    for (let i = 0; i < size; i += 1) {
      const idx = inserted + i;
      const id = uuidv7();
      // 70% user / 20% consumer / 10% system per AC#11.
      const r = idx % 10;
      let actorId: string | null = null;
      let consumerId: string | null = null;
      if (r < 7) {
        actorId = pick(userIds, idx);
      } else if (r < 9) {
        consumerId = pick(consumerIds, idx);
      } // else both null → system

      const action = pick(ACTIONS, idx);
      const targetResource = pick(TARGET_RESOURCES, idx);
      const targetId = uuidv7();
      // Spread created_at across last 365 days for realistic date-range queries.
      const createdAt = new Date(Date.now() - (idx % 365) * 86_400_000).toISOString();

      params.push(id, actorId, consumerId, action, targetResource, targetId, createdAt);
      const base = i * 7;
      valueRows.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
    }
    await pool.query(
      `INSERT INTO audit_logs (id, actor_id, consumer_id, action, target_resource, target_id, created_at)
       VALUES ${valueRows.join(',')}
       ON CONFLICT DO NOTHING`,
      params
    );
    inserted += size;
    if (inserted % 100_000 === 0 || inserted === total) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[seed-audit-bench] audit_logs ${inserted}/${total} (${elapsed}s elapsed)`);
    }
  }
}

async function tableCount(pool: pg.Pool, table: string): Promise<number> {
  const r = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return Number.parseInt(r.rows[0].count, 10);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[seed-audit-bench] Bench DB: ${benchDatabaseUrl.replace(/:([^@]*)@/, ':****@')}`);
  console.log(`[seed-audit-bench] Target audit_logs: ${TARGET_AUDIT_LOGS}`);

  await ensureBenchDatabase();
  await applySchemaIfMissing();

  const benchPool = new pg.Pool({ connectionString: benchDatabaseUrl, max: 4 });
  try {
    if (RESET) {
      console.log('[seed-audit-bench] --reset → bypassing append-only trigger via session_replication_role.');
      await benchPool.query(`SET session_replication_role = replica`);
      await benchPool.query(`TRUNCATE audit_logs CASCADE`);
      await benchPool.query(`SET session_replication_role = DEFAULT`);
    }

    const existingCount = await tableCount(benchPool, 'audit_logs');
    if (existingCount >= TARGET_AUDIT_LOGS && !RESET) {
      console.log(
        `[seed-audit-bench] Already seeded (audit_logs=${existingCount} ≥ ${TARGET_AUDIT_LOGS}). Use --reset to force re-seed.`
      );
      return;
    }

    const roleId = await ensureSeedRoles(benchPool);
    const userIds = await ensureSeedUsers(benchPool, 10, roleId);
    const consumerIds = await ensureSeedApiConsumers(benchPool, 3);
    console.log(`[seed-audit-bench] Have ${userIds.length} users + ${consumerIds.length} api_consumers.`);

    const remaining = Math.max(0, TARGET_AUDIT_LOGS - existingCount);
    if (remaining > 0) {
      console.log(`[seed-audit-bench] Seeding ${remaining} additional audit_logs (have ${existingCount}, target ${TARGET_AUDIT_LOGS})...`);
      await seedAuditLogs(benchPool, remaining, userIds, consumerIds);
    }

    const finalCount = await tableCount(benchPool, 'audit_logs');
    console.log(`[seed-audit-bench] ✓ audit_logs final count: ${finalCount}`);

    // ANALYZE so the EXPLAIN ANALYZE plans use accurate statistics.
    console.log('[seed-audit-bench] Running ANALYZE on audit_logs + users + api_consumers...');
    await benchPool.query(`ANALYZE audit_logs`);
    await benchPool.query(`ANALYZE users`);
    await benchPool.query(`ANALYZE api_consumers`);
    console.log('[seed-audit-bench] ✓ ANALYZE complete.');
  } finally {
    await benchPool.end();
  }

  console.log('[seed-audit-bench] Done.');
}

main().catch((err) => {
  console.error('[seed-audit-bench] FAILED:', err);
  process.exitCode = 1;
});

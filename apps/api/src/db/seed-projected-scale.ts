/**
 * Story 11-1 — Projected-scale seed (AC#11 Akintola-risk Move 1).
 *
 * Populates a scratch Postgres with the projected post-field-survey scale:
 *   - 500,000 respondents (mix of sources + statuses)
 *   - 1,000,000 submissions
 *   -   100,000 audit_logs
 *   -   100,000 marketplace_profiles
 *
 * Used by `verify-projected-scale-explains.ts` to run EXPLAIN (ANALYZE, BUFFERS)
 * on the 10 canonical queries and capture evidence into
 * `apps/api/src/db/explain-reports/11-1-projected-scale.md`.
 *
 * Operational notes:
 *   - Scratch DB will need ~4-8 GB disk + ~10-30 min wall-clock
 *   - Refuses to run against production (DATABASE_URL host check + NODE_ENV)
 *   - Idempotent: detects existing seed via row counts; skips if already at scale
 *   - Requires the 11-1 schema migration to be applied (run db:push:force +
 *     `tsx scripts/migrate-multi-source-registry-init.ts` first)
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api seed:projected-scale
 *   # Optional:
 *   #   --respondents=N --submissions=N --audit-logs=N --marketplace=N
 *   #   --reset (truncate + re-seed; default is skip-if-already-seeded)
 *   #   --batch=N (rows per insert; default 2000)
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uuidv7 } from 'uuidv7';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ---- safety guards --------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[seed-projected-scale] DATABASE_URL not set; aborting.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('[seed-projected-scale] NODE_ENV=production — refusing to run.');
  process.exit(1);
}
const lcUrl = databaseUrl.toLowerCase();
if (lcUrl.includes('prod') || lcUrl.includes('oyotrade') || lcUrl.includes('oyoskills')) {
  console.error('[seed-projected-scale] DATABASE_URL appears to point at production — refusing to run.');
  process.exit(1);
}

// ---- config from CLI ------------------------------------------------------
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

const TARGET_RESPONDENTS = parseInt10(getArg('respondents'), 500_000);
const TARGET_SUBMISSIONS = parseInt10(getArg('submissions'), 1_000_000);
const TARGET_AUDIT_LOGS = parseInt10(getArg('audit-logs'), 100_000);
const TARGET_MARKETPLACE = parseInt10(getArg('marketplace'), 100_000);
const BATCH = parseInt10(getArg('batch'), 2_000);
const RESET = process.argv.includes('--reset');

// Story 11-1 follow-up: --reset destroys ALL rows in 5 tables. The previous
// guards (NODE_ENV / hostname substring) only protect against pointing at
// production — but local dev DBs can hold real prod-derived data (restored
// from backup), and a careless --reset will TRUNCATE that data. The first
// run of this script wiped 874 real audit_logs rows from a local DB on
// 2026-05-03; this 4th gate is the fix-forward. To run with --reset you MUST
// also set SEED_PROJECTED_SCALE_RESET_CONFIRM=yes in the environment.
if (RESET && process.env.SEED_PROJECTED_SCALE_RESET_CONFIRM !== 'yes') {
  console.error('[seed-projected-scale] --reset will TRUNCATE 5 tables (respondents, submissions, audit_logs, marketplace_profiles, import_batches).');
  console.error('[seed-projected-scale] This is destructive even on a local dev DB — earlier runs of this script have wiped real audit_logs data.');
  console.error('[seed-projected-scale] To proceed, re-run with the explicit confirmation env var:');
  console.error('[seed-projected-scale]');
  console.error('[seed-projected-scale]   $env:SEED_PROJECTED_SCALE_RESET_CONFIRM = "yes"   # PowerShell');
  console.error('[seed-projected-scale]   export SEED_PROJECTED_SCALE_RESET_CONFIRM=yes      # bash');
  console.error('[seed-projected-scale]');
  console.error('[seed-projected-scale] Then re-run with --reset. Aborting.');
  process.exit(1);
}

// ---- deterministic-ish data generators ------------------------------------
const LGAS = [
  'oyo_west', 'oyo_east', 'oyo_north', 'oyo_south', 'ibadan_north',
  'ibadan_north_east', 'ibadan_north_west', 'ibadan_south_east', 'ibadan_south_west',
  'ido', 'akinyele', 'ona_ara', 'lagelu', 'ogbomoso_north', 'ogbomoso_south',
  'oluyole', 'iseyin', 'kajola', 'iwajowa', 'saki_west', 'saki_east',
  'orelope', 'olorunsogo', 'ogo_oluwa', 'irepo', 'iddo', 'atiba',
  'atisbo', 'ibarapa_central', 'ibarapa_east', 'ibarapa_north',
  'afijio', 'surulere', 'orire',
];
const SOURCES = ['enumerator', 'public', 'clerk', 'imported_itf_supa', 'imported_other'] as const;
// STATUSES is a type-level reference for the inline annotation below — keep it
// readable without dragging in the schema's `respondentStatusTypes`.
type RespondentStatus = 'active' | 'pending_nin_capture' | 'nin_unavailable' | 'imported_unverified';
const PROFESSIONS = [
  'tailor', 'carpenter', 'mason', 'electrician', 'plumber', 'mechanic',
  'welder', 'driver', 'farmer', 'trader', 'cobbler', 'baker', 'painter',
  'barber', 'hairstylist', 'caterer', 'roofer', 'tile_layer', 'glass_fitter',
];
const ACTIONS = [
  'user.created', 'user.updated', 'user.deactivated',
  'respondent.created', 'respondent.updated',
  'submission.processed', 'submission.flagged', 'submission.approved',
  'export.csv', 'export.pdf',
  'fraud.detection.created', 'fraud.detection.resolved',
  'consent.granted', 'consent.revoked',
  'login.success', 'login.failed',
];
const TARGET_RESOURCES = [
  'respondents', 'submissions', 'users', 'fraud_detections',
  'marketplace_profiles', 'consent_records', 'audit_logs', 'sessions',
];

let _ninCounter = 1_000_000_000;
function nextNin(): string {
  // 11-digit NINs, deterministic and unique
  _ninCounter += 1;
  return _ninCounter.toString().padStart(11, '0');
}

function pick<T>(arr: readonly T[], i: number): T { return arr[i % arr.length]; }
function rngFloat(seed: number): number { return ((seed * 9301 + 49297) % 233280) / 233280; }

// ---- main -----------------------------------------------------------------
async function tableCount(pool: pg.Pool, table: string): Promise<number> {
  const r = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return Number.parseInt(r.rows[0].count, 10);
}

async function ensureUploader(pool: pg.Pool): Promise<string> {
  // Need a real users.id to satisfy import_batches.uploaded_by FK.
  const existing = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`);
  if (existing.rows[0]?.id) return existing.rows[0].id;
  // Insert a synthetic super_admin role + user just to satisfy FK. The integration
  // tests never read this user back; it's only here so import_batches FK can resolve.
  const roleId = uuidv7();
  await pool.query(
    `INSERT INTO roles (id, name, description) VALUES ($1, 'seed_synthetic', 'projected-scale seed') ON CONFLICT (name) DO NOTHING`,
    [roleId],
  );
  const realRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'seed_synthetic' LIMIT 1`);
  const realRoleId = realRole.rows[0].id;
  const userId = uuidv7();
  await pool.query(
    `INSERT INTO users (id, email, full_name, role_id, status, password_hash)
     VALUES ($1, 'projected-scale-seed@oyoskills.test', 'Projected Scale Seed', $2, 'active', 'x')
     ON CONFLICT (email) DO NOTHING`,
    [userId, realRoleId],
  );
  const u = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'projected-scale-seed@oyoskills.test' LIMIT 1`);
  return u.rows[0].id;
}

async function seedImportBatches(pool: pg.Pool, uploaderId: string): Promise<string[]> {
  // 4 batches — one per non-organic source — give imported respondents a real FK target.
  const ids: string[] = [];
  for (const src of ['imported_itf_supa', 'imported_other'] as const) {
    const id = uuidv7();
    await pool.query(
      `INSERT INTO import_batches
        (id, source, original_filename, file_hash, file_size_bytes, parser_used, lawful_basis, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (file_hash) DO UPDATE SET source = EXCLUDED.source RETURNING id`,
      [id, src, `seed-${src}.csv`, `seed-hash-${src}-${id}`, 12345, 'csv', 'ndpa_6_1_e', uploaderId],
    );
    ids.push(id);
  }
  return ids;
}

async function seedRespondents(pool: pg.Pool, total: number, batchIds: string[]): Promise<void> {
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
      // ~70% have NIN (active); ~10% pending; ~10% nin_unavailable; ~10% imported_unverified
      const r = rngFloat(idx * 17 + 3);
      let status: RespondentStatus;
      let nin: string | null;
      let source: typeof SOURCES[number];
      let importBatchId: string | null = null;
      let externalRef: string | null = null;
      let importedAt: string | null = null;
      if (r < 0.7) {
        status = 'active';
        nin = nextNin();
        source = pick(SOURCES.slice(0, 3), idx); // organic
      } else if (r < 0.8) {
        status = 'pending_nin_capture';
        nin = null;
        source = 'enumerator';
      } else if (r < 0.9) {
        status = 'nin_unavailable';
        nin = null;
        source = 'public';
      } else {
        status = 'imported_unverified';
        nin = idx % 3 === 0 ? nextNin() : null;
        source = idx % 2 === 0 ? 'imported_itf_supa' : 'imported_other';
        importBatchId = batchIds[idx % batchIds.length];
        externalRef = `EXT-${idx.toString().padStart(8, '0')}`;
        importedAt = new Date(Date.now() - (idx % 365) * 86_400_000).toISOString();
      }
      const lga = pick(LGAS, idx);
      const createdAt = new Date(Date.now() - (idx % 365) * 86_400_000).toISOString();
      params.push(
        id, nin, lga, source, status, externalRef, importBatchId, importedAt, createdAt,
      );
      const base = i * 9;
      valueRows.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 9})`,
      );
    }
    const sql = `
      INSERT INTO respondents
        (id, nin, lga_id, source, status, external_reference_id, import_batch_id, imported_at, created_at, updated_at)
      VALUES ${valueRows.join(',')}
      ON CONFLICT DO NOTHING
    `;
    await pool.query(sql, params);
    inserted += size;
    if (inserted % 50_000 === 0 || inserted === total) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[seed-projected-scale] respondents ${inserted}/${total} (${elapsed}s elapsed)`);
    }
  }
}

async function seedSubmissions(pool: pg.Pool, total: number): Promise<void> {
  // Fetch a sample of respondent IDs to FK-link submissions. Skip pure FK-less
  // pattern — submissions.respondent_id has FK constraint to respondents(id).
  const sample = await pool.query<{ id: string }>(`SELECT id FROM respondents WHERE nin IS NOT NULL LIMIT 50000`);
  if (sample.rows.length === 0) {
    console.warn('[seed-projected-scale] No respondents with NIN found; submissions seed will skip.');
    return;
  }
  const respondentIds = sample.rows.map((r) => r.id);
  // Fetch a sample of users (enumerators) to FK-link submissions.enumerator_id.
  const enumSample = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 100`);
  if (enumSample.rows.length === 0) {
    console.warn('[seed-projected-scale] No users found for enumerator FK; submissions seed will skip.');
    return;
  }
  const enumeratorIds = enumSample.rows.map((r) => r.id);
  // Fetch a sample of questionnaire forms (FK target).
  const formSample = await pool.query<{ id: string }>(`SELECT id FROM questionnaire_forms LIMIT 10`);
  if (formSample.rows.length === 0) {
    console.warn('[seed-projected-scale] No questionnaire_forms — submissions seed will skip.');
    return;
  }
  const formIds = formSample.rows.map((r) => r.id);

  // Inspect submissions table to learn its columns; we only insert the columns
  // we know exist + are NOT NULL, plus respondent_id / enumerator_id / submitted_at
  // for the EXPLAIN-relevant indexes.
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
      const respId = pick(respondentIds, idx);
      const enumId = pick(enumeratorIds, idx);
      const formId = pick(formIds, idx);
      const subUid = `SUB-${idx.toString().padStart(9, '0')}-${id.slice(0, 8)}`;
      const submittedAt = new Date(Date.now() - (idx % 365) * 86_400_000).toISOString();
      // Columns: id / submission_uid / respondent_id / enumerator_id / questionnaire_form_id /
      // submitted_at / ingested_at / created_at / updated_at. ingested_at + created_at +
      // updated_at all reuse submittedAt for simplicity (correct shape for query plans).
      params.push(id, subUid, respId, enumId, formId, submittedAt);
      const base = i * 6;
      valueRows.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 6}, $${base + 6}, $${base + 6})`,
      );
    }
    const sql = `
      INSERT INTO submissions
        (id, submission_uid, respondent_id, enumerator_id, questionnaire_form_id, submitted_at, ingested_at, created_at, updated_at)
      VALUES ${valueRows.join(',')}
      ON CONFLICT DO NOTHING
    `;
    try {
      await pool.query(sql, params);
    } catch (err) {
      // submissions schema may have additional NOT NULL columns we don't know about.
      // Surface the error and stop — operator can either widen the seed shape or
      // accept partial coverage. The 10 canonical queries depend on submissions
      // existing in volume, so we can't continue silently.
      console.error('[seed-projected-scale] submissions INSERT failed:', (err as Error).message);
      console.error('[seed-projected-scale] Inspect submissions schema with: docker exec oslsr_postgres psql -U user -d app_db -c "\\d submissions"');
      console.error('[seed-projected-scale] Then update seedSubmissions() column list to match.');
      throw err;
    }
    inserted += size;
    if (inserted % 100_000 === 0 || inserted === total) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[seed-projected-scale] submissions ${inserted}/${total} (${elapsed}s elapsed)`);
    }
  }
}

async function seedAuditLogs(pool: pg.Pool, total: number): Promise<void> {
  const usersSample = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 100`);
  if (usersSample.rows.length === 0) {
    console.warn('[seed-projected-scale] No users — audit-logs seed will skip.');
    return;
  }
  const userIds = usersSample.rows.map((r) => r.id);
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
      const actorId = pick(userIds, idx);
      const action = pick(ACTIONS, idx);
      const targetResource = pick(TARGET_RESOURCES, idx);
      const targetId = uuidv7();
      const createdAt = new Date(Date.now() - (idx % 365) * 86_400_000).toISOString();
      params.push(id, actorId, action, targetResource, targetId, createdAt);
      const base = i * 6;
      valueRows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    }
    const sql = `
      INSERT INTO audit_logs
        (id, actor_id, action, target_resource, target_id, created_at)
      VALUES ${valueRows.join(',')}
      ON CONFLICT DO NOTHING
    `;
    try {
      await pool.query(sql, params);
    } catch (err) {
      console.error('[seed-projected-scale] audit_logs INSERT failed:', (err as Error).message);
      console.error('[seed-projected-scale] Inspect audit_logs schema with: docker exec oslsr_postgres psql -U user -d app_db -c "\\d audit_logs"');
      throw err;
    }
    inserted += size;
    if (inserted % 25_000 === 0 || inserted === total) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[seed-projected-scale] audit_logs ${inserted}/${total} (${elapsed}s elapsed)`);
    }
  }
}

async function seedMarketplaceProfiles(pool: pg.Pool, total: number): Promise<void> {
  const respSample = await pool.query<{ id: string; lga_id: string | null }>(
    `SELECT id, lga_id FROM respondents WHERE nin IS NOT NULL LIMIT $1`,
    [total],
  );
  if (respSample.rows.length === 0) {
    console.warn('[seed-projected-scale] No respondents — marketplace_profiles seed will skip.');
    return;
  }
  const startedAt = Date.now();
  let inserted = 0;
  let cursor = 0;
  while (inserted < total && cursor < respSample.rows.length) {
    const remaining = total - inserted;
    const size = Math.min(BATCH, remaining, respSample.rows.length - cursor);
    const params: unknown[] = [];
    const valueRows: string[] = [];
    for (let i = 0; i < size; i += 1) {
      const idx = cursor + i;
      const row = respSample.rows[idx];
      const id = uuidv7();
      const profession = pick(PROFESSIONS, idx);
      const verified = idx % 3 === 0;
      const lgaName = row.lga_id ?? pick(LGAS, idx);
      const skills = JSON.stringify([profession, pick(PROFESSIONS, idx + 1)]);
      const exp = pick(['novice', 'intermediate', 'expert'], idx);
      const createdAt = new Date(Date.now() - (idx % 365) * 86_400_000).toISOString();
      params.push(id, row.id, profession, skills, lgaName, exp, verified, createdAt);
      const base = i * 8;
      valueRows.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
      );
    }
    const sql = `
      INSERT INTO marketplace_profiles
        (id, respondent_id, profession, skills, lga_name, experience_level, verified_badge, created_at)
      VALUES ${valueRows.join(',')}
      ON CONFLICT DO NOTHING
    `;
    try {
      await pool.query(sql, params);
    } catch (err) {
      console.error('[seed-projected-scale] marketplace_profiles INSERT failed:', (err as Error).message);
      console.error('[seed-projected-scale] Inspect marketplace_profiles schema with: docker exec oslsr_postgres psql -U user -d app_db -c "\\d marketplace_profiles"');
      throw err;
    }
    inserted += size;
    cursor += size;
    if (inserted % 25_000 === 0 || inserted === total) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[seed-projected-scale] marketplace_profiles ${inserted}/${total} (${elapsed}s elapsed)`);
    }
  }
}

async function main() {
  const url = databaseUrl as string;
  console.log('[seed-projected-scale] Connecting to', url.replace(/:[^@/]+@/, ':***@'));
  const pool = new pg.Pool({ connectionString: url, max: 4 });

  if (RESET) {
    console.warn('[seed-projected-scale] --reset specified — TRUNCATING respondents/submissions/audit_logs/marketplace_profiles');
    await pool.query(
      `TRUNCATE marketplace_profiles, audit_logs, submissions, respondents, import_batches RESTART IDENTITY CASCADE`,
    );
  }

  const counts = {
    respondents: await tableCount(pool, 'respondents'),
    submissions: await tableCount(pool, 'submissions'),
    audit_logs: await tableCount(pool, 'audit_logs'),
    marketplace_profiles: await tableCount(pool, 'marketplace_profiles'),
  };
  console.log('[seed-projected-scale] Existing counts:', counts);

  const uploaderId = await ensureUploader(pool);
  const batchIds = await seedImportBatches(pool, uploaderId);

  if (counts.respondents < TARGET_RESPONDENTS) {
    await seedRespondents(pool, TARGET_RESPONDENTS - counts.respondents, batchIds);
  } else {
    console.log(`[seed-projected-scale] respondents already ≥ ${TARGET_RESPONDENTS} — skipping`);
  }
  if (counts.submissions < TARGET_SUBMISSIONS) {
    await seedSubmissions(pool, TARGET_SUBMISSIONS - counts.submissions);
  } else {
    console.log(`[seed-projected-scale] submissions already ≥ ${TARGET_SUBMISSIONS} — skipping`);
  }
  if (counts.audit_logs < TARGET_AUDIT_LOGS) {
    await seedAuditLogs(pool, TARGET_AUDIT_LOGS - counts.audit_logs);
  } else {
    console.log(`[seed-projected-scale] audit_logs already ≥ ${TARGET_AUDIT_LOGS} — skipping`);
  }
  if (counts.marketplace_profiles < TARGET_MARKETPLACE) {
    await seedMarketplaceProfiles(pool, TARGET_MARKETPLACE - counts.marketplace_profiles);
  } else {
    console.log(`[seed-projected-scale] marketplace_profiles already ≥ ${TARGET_MARKETPLACE} — skipping`);
  }

  // Run ANALYZE so Postgres has fresh stats for the EXPLAIN runs that follow.
  console.log('[seed-projected-scale] Running ANALYZE on touched tables...');
  await pool.query('ANALYZE respondents');
  await pool.query('ANALYZE submissions');
  await pool.query('ANALYZE audit_logs');
  await pool.query('ANALYZE marketplace_profiles');
  await pool.query('ANALYZE import_batches');

  const finalCounts = {
    respondents: await tableCount(pool, 'respondents'),
    submissions: await tableCount(pool, 'submissions'),
    audit_logs: await tableCount(pool, 'audit_logs'),
    marketplace_profiles: await tableCount(pool, 'marketplace_profiles'),
    import_batches: await tableCount(pool, 'import_batches'),
  };
  console.log('[seed-projected-scale] Final counts:', finalCounts);
  console.log('[seed-projected-scale] Done.');

  await pool.end();
}

main().catch((err) => {
  console.error('[seed-projected-scale] FAILED:', err);
  process.exit(1);
});

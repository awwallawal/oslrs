/**
 * Performance Test Data Seed Script
 *
 * Generates respondents, submissions, and fraud_detections at scale
 * for cross-LGA query performance validation (Prep-5).
 *
 * Usage:
 *   pnpm tsx scripts/seed-performance-test-data.ts --scale=10k
 *   pnpm tsx scripts/seed-performance-test-data.ts --scale=100k
 *   pnpm tsx scripts/seed-performance-test-data.ts --scale=500k
 *   pnpm tsx scripts/seed-performance-test-data.ts --clean
 *   pnpm tsx scripts/seed-performance-test-data.ts --analyze
 */

import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = pg;

// ── Constants ─────────────────────────────────────────────────────────────

const NIN_PREFIX = '99';
const PERF_EMAIL_PREFIX = 'perftest-';
const BATCH_SIZE = 500;

const LGA_CODES = [
  'afijio', 'akinyele', 'atiba', 'atisbo', 'egbeda',
  'ibadan_north', 'ibadan_north_east', 'ibadan_north_west',
  'ibadan_south_east', 'ibadan_south_west',
  'ibarapa_central', 'ibarapa_east', 'ibarapa_north', 'ido', 'irepo',
  'iseyin', 'itesiwaju', 'iwajowa', 'kajola', 'lagelu',
  'ogbomosho_north', 'ogbomosho_south', 'ogo_oluwa', 'olorunsogo', 'oluyole',
  'ona_ara', 'orelope', 'ori_ire', 'oyo_east', 'oyo_west',
  'saki_east', 'saki_west', 'surulere',
];

// Weighted pool: Ibadan LGAs 3x for urban-heavy realism
const WEIGHTED_LGAS: string[] = [];
for (const code of LGA_CODES) {
  const w = code.startsWith('ibadan') ? 3 : 1;
  for (let i = 0; i < w; i++) WEIGHTED_LGAS.push(code);
}

const OCCUPATIONS = [
  'Carpentry', 'Tailoring', 'Trading', 'Hairdressing', 'Farming',
  'Mechanics', 'Welding', 'Electrician', 'Plumbing', 'Mason',
  'Driving', 'Teaching', 'Nursing', 'IT/Computer', 'Food Processing',
  'Leatherworks', 'Blacksmith', 'Weaving', 'Photography', 'Other',
];

const EDUCATION = ['None', 'Primary', 'Secondary', 'Tertiary', 'Vocational'];
const SOURCES = ['enumerator', 'public', 'clerk'] as const;
const SOURCE_W = [60, 25, 15];
const SEVERITIES = ['clean', 'low', 'medium', 'high', 'critical'] as const;
const SEVERITY_W = [60, 20, 10, 7, 3];
const RESOLUTIONS = [
  'confirmed_fraud', 'false_positive', 'needs_investigation',
  'dismissed', 'enumerator_warned',
] as const;

const DATE_START = new Date('2025-08-01T00:00:00Z').getTime();
const DATE_RANGE = new Date('2026-02-01T00:00:00Z').getTime() - DATE_START;

// ── Helpers ───────────────────────────────────────────────────────────────

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
function pickW<T>(items: readonly T[], weights: number[]): T {
  let r = Math.random() * 100, cum = 0;
  for (let i = 0; i < items.length; i++) { cum += weights[i]; if (r < cum) return items[i]; }
  return items[items.length - 1];
}
const rDate = () => new Date(DATE_START + Math.random() * DATE_RANGE);
const rScore = (max: number) => (Math.random() * max).toFixed(2);

function buildInsert(table: string, cols: string[], rows: unknown[][], casts?: Record<number, string>) {
  const vals: unknown[] = [];
  const placeholders: string[] = [];
  for (const row of rows) {
    const ph: string[] = [];
    for (let j = 0; j < row.length; j++) {
      vals.push(row[j]);
      ph.push(`$${vals.length}${casts?.[j] || ''}`);
    }
    placeholders.push(`(${ph.join(',')})`);
  }
  return { text: `INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders.join(',')}`, values: vals };
}

// ── CLI parsing ───────────────────────────────────────────────────────────

function parseScale(): number {
  const arg = process.argv.find(a => a.startsWith('--scale='));
  if (!arg) return 0;
  const v = arg.split('=')[1].toLowerCase();
  if (v === '10k') return 10_000;
  if (v === '100k') return 100_000;
  if (v === '500k') return 500_000;
  throw new Error(`Invalid scale: ${v}. Use 10k, 100k, or 500k`);
}
const hasFlag = (f: string) => process.argv.includes(f);

// ── Cleanup ───────────────────────────────────────────────────────────────

async function cleanup(pool: pg.Pool) {
  console.log('🧹 Cleaning up performance test data...');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    let r = await c.query(`DELETE FROM fraud_detections WHERE submission_id IN (
      SELECT s.id FROM submissions s JOIN respondents r ON s.respondent_id = r.id WHERE r.nin LIKE $1)`, [`${NIN_PREFIX}%`]);
    console.log(`  Deleted ${r.rowCount} fraud_detections`);

    r = await c.query(`DELETE FROM submissions WHERE respondent_id IN (
      SELECT id FROM respondents WHERE nin LIKE $1)`, [`${NIN_PREFIX}%`]);
    console.log(`  Deleted ${r.rowCount} submissions`);

    r = await c.query(`DELETE FROM respondents WHERE nin LIKE $1`, [`${NIN_PREFIX}%`]);
    console.log(`  Deleted ${r.rowCount} respondents`);

    r = await c.query(`DELETE FROM users WHERE email LIKE $1`, [`${PERF_EMAIL_PREFIX}%`]);
    console.log(`  Deleted ${r.rowCount} perf test users`);

    await c.query('COMMIT');
    console.log('✅ Cleanup complete');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// ── Enumerator setup ──────────────────────────────────────────────────────

async function ensureEnumerators(pool: pg.Pool, count: number): Promise<string[]> {
  const c = await pool.connect();
  try {
    const roleRes = await c.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'enumerator' LIMIT 1`);
    if (!roleRes.rows.length) throw new Error('Enumerator role not found. Run db:seed:dev first.');
    const roleId = roleRes.rows[0].id;

    const existing = await c.query<{ id: string }>(`SELECT id FROM users WHERE email LIKE $1 ORDER BY email`, [`${PERF_EMAIL_PREFIX}%`]);
    if (existing.rows.length >= count) return existing.rows.slice(0, count).map(r => r.id);

    const lgaRes = await c.query<{ id: string; code: string }>(`SELECT id, code FROM lgas`);
    const lgaMap = new Map(lgaRes.rows.map(r => [r.code, r.id]));

    const ids = existing.rows.map(r => r.id);
    for (let i = existing.rows.length; i < count; i++) {
      const id = uuidv7();
      const lgaId = lgaMap.get(LGA_CODES[i % 33]) || null;
      await c.query(
        `INSERT INTO users (id, email, full_name, role_id, lga_id, status, is_seeded) VALUES ($1,$2,$3,$4,$5,'active',true) ON CONFLICT (email) DO NOTHING`,
        [id, `${PERF_EMAIL_PREFIX}${i}@perf.local`, `Perf Enum ${i}`, roleId, lgaId],
      );
      ids.push(id);
    }
    console.log(`  ✅ ${count} perf test enumerators ready`);
    return ids;
  } finally {
    c.release();
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────

async function seed(pool: pg.Pool, scale: number) {
  console.log(`\n🚀 Seeding ${scale.toLocaleString()} rows...\n`);
  const t0 = Date.now();
  const formId = uuidv7();
  const enums = await ensureEnumerators(pool, 50);
  const totalBatches = Math.ceil(scale / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const off = b * BATCH_SIZE;
    const sz = Math.min(BATCH_SIZE, scale - off);

    const rRows: unknown[][] = [];
    const sRows: unknown[][] = [];
    const fRows: unknown[][] = [];

    for (let i = 0; i < sz; i++) {
      const gi = off + i;
      const date = rDate();
      const rid = uuidv7(), sid = uuidv7(), fid = uuidv7();
      const enumId = pick(enums);
      const lga = pick(WEIGHTED_LGAS);
      const src = pickW(SOURCES, SOURCE_W);
      const sev = pickW(SEVERITIES, SEVERITY_W);
      const sevIdx = SEVERITIES.indexOf(sev);
      const reviewed = sevIdx >= 2 && Math.random() < 0.4;
      const gps = rScore(25), spd = rScore(25), stl = rScore(20), dup = rScore(20), tmg = rScore(10);
      const total = (parseFloat(gps) + parseFloat(spd) + parseFloat(stl) + parseFloat(dup) + parseFloat(tmg)).toFixed(2);

      rRows.push([
        rid, `${NIN_PREFIX}${String(gi + 1).padStart(9, '0')}`,
        `First${gi}`, `Last${gi}`, lga, src, date, date,
      ]);

      const rawData = {
        occupation: pick(OCCUPATIONS),
        gender: Math.random() < 0.52 ? 'Male' : 'Female',
        firstName: `First${gi}`, lastName: `Last${gi}`,
        age: 18 + Math.floor(Math.random() * 47),
        education_level: pick(EDUCATION),
      };

      sRows.push([
        sid, `perf-${gi}`, formId, rid, enumId, enumId,
        JSON.stringify(rawData),
        7.15 + Math.random() * 1.7, 2.7 + Math.random() * 1.9,
        300 + Math.floor(Math.random() * 3300),
        date, date, src, true, date, date, date,
      ]);

      fRows.push([
        fid, sid, enumId, new Date(date.getTime() + 3600000), 1,
        gps, spd, stl, dup, tmg, total, sev,
        reviewed ? pick(RESOLUTIONS) : null,
        reviewed ? pick(enums) : null,
        reviewed ? new Date(date.getTime() + 86400000) : null,
        reviewed ? 'Reviewed' : null,
      ]);
    }

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const rq = buildInsert('respondents',
        ['id','nin','first_name','last_name','lga_id','source','created_at','updated_at'], rRows);
      await c.query(rq.text, rq.values);

      const sq = buildInsert('submissions',
        ['id','submission_uid','questionnaire_form_id','respondent_id','enumerator_id','submitter_id',
         'raw_data','gps_latitude','gps_longitude','completion_time_seconds',
         'submitted_at','ingested_at','source','processed','processed_at','created_at','updated_at'],
        sRows, { 6: '::jsonb' });
      await c.query(sq.text, sq.values);

      const fq = buildInsert('fraud_detections',
        ['id','submission_id','enumerator_id','computed_at','config_snapshot_version',
         'gps_score','speed_score','straightline_score','duplicate_score','timing_score',
         'total_score','severity','resolution','reviewed_by','reviewed_at','resolution_notes'],
        fRows);
      await c.query(fq.text, fq.values);

      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }

    if ((b + 1) % 20 === 0 || b === totalBatches - 1) {
      const pct = ((b + 1) / totalBatches * 100).toFixed(1);
      console.log(`  ${pct}% (${(off + sz).toLocaleString()} rows, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }

  console.log(`\n✅ Seeded ${scale.toLocaleString()} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log('\n📊 Running ANALYZE...');
  await pool.query('ANALYZE respondents');
  await pool.query('ANALYZE submissions');
  await pool.query('ANALYZE fraud_detections');
  console.log('✅ Table statistics updated');
}

// ── EXPLAIN ANALYZE queries ───────────────────────────────────────────────

async function runAnalyze(pool: pg.Pool) {
  console.log('\n📊 Running EXPLAIN ANALYZE queries...\n');

  const queries: { label: string; story: string; sql: string }[] = [
    // Story 5.1 queries
    {
      label: '5.1-Q1: Total respondent count',
      story: '5.1',
      sql: `SELECT COUNT(*) FROM respondents`,
    },
    {
      label: '5.1-Q2: Per-LGA respondent counts',
      story: '5.1',
      sql: `SELECT lga_id, COUNT(*) FROM respondents GROUP BY lga_id`,
    },
    {
      label: '5.1-Q3: Daily registration trends (30 days)',
      story: '5.1',
      sql: `SELECT DATE(created_at) AS day, COUNT(*) FROM respondents WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY day`,
    },
    {
      label: '5.1-Q4: Skills/occupation distribution (JSONB)',
      story: '5.1',
      sql: `SELECT raw_data->>'occupation' AS skill, COUNT(*) FROM submissions WHERE raw_data->>'occupation' IS NOT NULL GROUP BY raw_data->>'occupation' ORDER BY count DESC`,
    },
    // Story 5.2 queries
    {
      label: '5.2-Q1: Assessor audit queue (JOIN 3 tables + WHERE)',
      story: '5.2',
      sql: `SELECT fd.id, fd.severity, fd.total_score, fd.resolution, s.submitted_at, r.lga_id
            FROM fraud_detections fd
            JOIN submissions s ON fd.submission_id = s.id
            JOIN respondents r ON s.respondent_id = r.id
            WHERE fd.resolution IS NULL AND fd.severity IN ('high', 'critical')
            ORDER BY fd.computed_at DESC LIMIT 20`,
    },
    {
      label: '5.2-Q2: Audit queue with LGA filter',
      story: '5.2',
      sql: `SELECT fd.id, fd.severity, fd.total_score
            FROM fraud_detections fd
            JOIN submissions s ON fd.submission_id = s.id
            JOIN respondents r ON s.respondent_id = r.id
            WHERE fd.resolution IS NULL AND fd.severity IN ('high', 'critical')
              AND r.lga_id = 'ibadan_north'
            ORDER BY fd.computed_at DESC LIMIT 20`,
    },
    {
      label: '5.2-Q3: Severity + resolution composite index scan',
      story: '5.2',
      sql: `SELECT id, severity, resolution FROM fraud_detections WHERE severity = 'high' AND resolution IS NULL LIMIT 20`,
    },
    // Story 5.5 queries
    {
      label: '5.5-Q1: Cursor pagination page 1',
      story: '5.5',
      sql: `SELECT r.id, r.nin, r.first_name, r.last_name, r.lga_id, r.source, r.created_at
            FROM respondents r ORDER BY r.created_at DESC, r.id DESC LIMIT 20`,
    },
    {
      label: '5.5-Q2: Cursor pagination deep page (offset simulation)',
      story: '5.5',
      sql: `SELECT r.id, r.nin, r.first_name, r.last_name, r.lga_id, r.source, r.created_at
            FROM respondents r
            WHERE r.created_at <= '2025-10-15T00:00:00Z'
            ORDER BY r.created_at DESC, r.id DESC LIMIT 20`,
    },
    {
      label: '5.5-Q3: Multi-filter (LGA + date range + source)',
      story: '5.5',
      sql: `SELECT r.id, r.nin, r.first_name, r.last_name, r.lga_id, r.source, r.created_at
            FROM respondents r
            WHERE r.lga_id = 'ibadan_north'
              AND r.created_at BETWEEN '2025-09-01' AND '2025-12-01'
              AND r.source = 'enumerator'
            ORDER BY r.created_at DESC, r.id DESC LIMIT 20`,
    },
    {
      label: '5.5-Q4: Free text search (ILIKE on name)',
      story: '5.5',
      sql: `SELECT r.id, r.first_name, r.last_name FROM respondents r
            WHERE r.first_name ILIKE '%First123%' OR r.last_name ILIKE '%Last456%'
            LIMIT 20`,
    },
    {
      label: '5.5-Q5: Gender filter from JSONB (submissions)',
      story: '5.5',
      sql: `SELECT r.id, r.first_name, r.lga_id, s.raw_data->>'gender' AS gender
            FROM respondents r
            JOIN submissions s ON s.respondent_id = r.id
            WHERE s.raw_data->>'gender' = 'Female'
              AND r.lga_id = 'ibadan_north'
            ORDER BY r.created_at DESC LIMIT 20`,
    },
    {
      label: '5.5-Q6: Respondents with fraud severity filter',
      story: '5.5',
      sql: `SELECT r.id, r.first_name, r.lga_id, fd.severity, fd.total_score
            FROM respondents r
            JOIN submissions s ON s.respondent_id = r.id
            JOIN fraud_detections fd ON fd.submission_id = s.id
            WHERE fd.severity IN ('high', 'critical')
              AND r.lga_id IN ('ibadan_north', 'ibadan_south_west')
            ORDER BY r.created_at DESC LIMIT 20`,
    },
  ];

  const results: { label: string; story: string; time: number; plan: string }[] = [];

  for (const q of queries) {
    try {
      const res = await pool.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${q.sql}`);
      const plan = res.rows.map(r => r['QUERY PLAN']).join('\n');

      // Extract execution time from last line
      const timeMatch = plan.match(/Execution Time: ([\d.]+) ms/);
      const time = timeMatch ? parseFloat(timeMatch[1]) : -1;

      results.push({ label: q.label, story: q.story, time, plan });

      const status = time < 250 ? '✅' : time < 500 ? '⚠️' : '❌';
      console.log(`${status} ${q.label}: ${time.toFixed(2)}ms`);
    } catch (err: any) {
      console.log(`❌ ${q.label}: ERROR - ${err.message}`);
      results.push({ label: q.label, story: q.story, time: -1, plan: `ERROR: ${err.message}` });
    }
  }

  // Print detailed plans
  console.log('\n' + '═'.repeat(80));
  console.log('DETAILED QUERY PLANS');
  console.log('═'.repeat(80));
  for (const r of results) {
    console.log(`\n── ${r.label} (${r.time.toFixed(2)}ms) ──`);
    console.log(r.plan);
  }

  // Summary table
  console.log('\n' + '═'.repeat(80));
  console.log('SUMMARY');
  console.log('═'.repeat(80));
  console.log(`${'Query'.padEnd(55)} ${'Time (ms)'.padStart(12)} ${'Status'.padStart(8)}`);
  console.log('─'.repeat(80));
  for (const r of results) {
    const status = r.time < 0 ? 'ERROR' : r.time < 100 ? 'FAST' : r.time < 250 ? 'OK' : r.time < 500 ? 'SLOW' : 'FAIL';
    console.log(`${r.label.padEnd(55)} ${r.time.toFixed(2).padStart(12)} ${status.padStart(8)}`);
  }

  // Note: Seq scans on respondents for unfiltered COUNT(*) are expected and acceptable.
  // PostgreSQL cannot use index-only scans for COUNT(*) on heap tables.
  // See spike-cross-lga-performance.md for authoritative query plans and index recommendations.
  const seqScans = results.filter(r =>
    r.plan.includes('Seq Scan') && !r.plan.includes('Seq Scan on respondents'));
  if (seqScans.length > 0) {
    console.log('\n⚠️  Sequential scans detected on large tables (excluding expected respondents scans):');
    for (const s of seqScans) console.log(`  - ${s.label}`);
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    if (hasFlag('--clean')) { await cleanup(pool); return; }
    if (hasFlag('--analyze')) { await runAnalyze(pool); return; }

    const scale = parseScale();
    if (!scale) {
      console.log('Usage:');
      console.log('  pnpm tsx scripts/seed-performance-test-data.ts --scale=10k|100k|500k');
      console.log('  pnpm tsx scripts/seed-performance-test-data.ts --clean');
      console.log('  pnpm tsx scripts/seed-performance-test-data.ts --analyze');
      process.exit(1);
    }

    // Check for existing perf data
    const existing = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM respondents WHERE nin LIKE $1`, [`${NIN_PREFIX}%`]);
    if (existing.rows[0].c > 0) {
      console.log(`⚠️  ${existing.rows[0].c} perf test respondents already exist. Run --clean first.`);
      process.exit(1);
    }

    await seed(pool, scale);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });

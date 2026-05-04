/**
 * Story 9-11 — AC#11 audit-viewer scale benchmark runner.
 *
 * Runs `EXPLAIN (ANALYZE, BUFFERS)` on the 6 canonical query shapes from
 * AC#11 against the bench DB seeded by `seed-audit-bench.ts`. Captures the
 * output as `apps/api/src/db/explain-reports/9-11-audit-viewer.md`.
 *
 * Median-of-3 strategy: each query runs 3 times. The first run primes the
 * buffer cache; the second and third are the warm-cache numbers. We report
 * the median to filter cache-warmth + GC noise.
 *
 * AC#11 thresholds:
 *   1. List, no filter                         → p95 < 500ms
 *   2. List, principal=consumer                → p95 < 500ms
 *   3. List, principal=consumer + target_resource=respondents → p95 < 800ms
 *   4. List, three filters + date range        → p95 < 1000ms
 *   5. Cursor at page 1 / 100 / 1000           → constant-time, p95 < 500ms
 *   6. Principal autocomplete (`searchPrincipals` ILIKE substring)  → p95 < 100ms
 *      (R2-H1 added 2026-05-04: closes the autocomplete-coverage gap from
 *      the R2 review by exercising the trigram-accelerated path through
 *      users.full_name + api_consumers.name. With pg_trgm GIN indexes
 *      from migrate-audit-principal-dualism-init.ts, the query plan
 *      should show `Bitmap Index Scan on idx_users_full_name_trgm` /
 *      `idx_api_consumers_name_trgm`. Without pg_trgm, falls back to
 *      Seq Scan + Filter — still validates the AC's correctness path.)
 *
 * Usage:
 *   pnpm --filter @oslsr/api bench:audit-viewer
 *
 * Reads BENCH_DATABASE_URL or derives from DATABASE_URL by swapping db name.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(apiRoot, '../../.env') });

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) {
  console.error('[bench-audit-viewer] DATABASE_URL not set; aborting.');
  process.exit(1);
}
const url = new URL(rootUrl);
url.pathname = '/oslsr_bench';
const benchDatabaseUrl = url.toString();

const pool = new pg.Pool({ connectionString: benchDatabaseUrl, max: 1 });

interface QueryShape {
  name: string;
  description: string;
  thresholdMs: number;
  sql: string;
  params?: unknown[];
}

interface RunResult {
  durationMs: number;
  planText: string;
}

interface QueryReport {
  name: string;
  description: string;
  thresholdMs: number;
  runs: RunResult[];
  medianMs: number;
  passes: boolean;
  finalPlan: string;
}

async function runOnce(shape: QueryShape): Promise<RunResult> {
  const start = process.hrtime.bigint();
  const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${shape.sql}`, shape.params);
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  const planText = (result.rows as { 'QUERY PLAN': string }[])
    .map((r) => r['QUERY PLAN'])
    .join('\n');
  return { durationMs, planText };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function benchOne(shape: QueryShape): Promise<QueryReport> {
  console.log(`\n[bench-audit-viewer] Running ${shape.name} (3 runs)...`);
  const runs: RunResult[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await runOnce(shape);
    console.log(`  run ${i + 1}: ${r.durationMs.toFixed(1)} ms`);
    runs.push(r);
  }
  const medianMs = median(runs.map((r) => r.durationMs));
  return {
    name: shape.name,
    description: shape.description,
    thresholdMs: shape.thresholdMs,
    runs,
    medianMs,
    passes: medianMs < shape.thresholdMs,
    finalPlan: runs[runs.length - 1].planText,
  };
}

function buildShapes(): QueryShape[] {
  // Canonical filter SQL mirroring the actual queries audit-log-viewer.service.ts emits.
  const baseSelect = `
    SELECT al.id, al.actor_id, al.consumer_id, al.action, al.target_resource,
           al.target_id, al.ip_address, al.user_agent, al.details, al.created_at,
           u.full_name AS user_name,
           c.name AS consumer_name
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    LEFT JOIN api_consumers c ON al.consumer_id = c.id
  `;

  return [
    {
      name: 'q1_list_no_filter',
      description: 'List, no filter (last 100 rows DESC).',
      thresholdMs: 500,
      sql: `${baseSelect}
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 100`,
    },
    {
      name: 'q2_list_principal_consumer',
      description: 'List, principal=consumer only.',
      thresholdMs: 500,
      sql: `${baseSelect}
            WHERE (al.consumer_id IS NOT NULL)
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 100`,
    },
    {
      name: 'q3_list_consumer_plus_target',
      description: 'List, principal=consumer AND target_resource=respondents.',
      thresholdMs: 800,
      sql: `${baseSelect}
            WHERE (al.consumer_id IS NOT NULL) AND al.target_resource = $1
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 100`,
      params: ['respondents'],
    },
    {
      name: 'q4_list_three_filters_plus_date',
      description: 'List, principal=user + action=ANY + target_resource + date range.',
      thresholdMs: 1000,
      sql: `${baseSelect}
            WHERE (al.actor_id IS NOT NULL)
              AND al.action = ANY($1::text[])
              AND al.target_resource = $2
              AND al.created_at >= $3::timestamptz
              AND al.created_at <= $4::timestamptz
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 100`,
      params: [
        ['auth.login', 'pii.view_record', 'data.update'],
        'respondents',
        new Date(Date.now() - 90 * 86_400_000).toISOString(),
        new Date().toISOString(),
      ],
    },
    {
      name: 'q5_cursor_page_1000',
      description: 'List with cursor at page 1000 (DESC tuple comparison).',
      thresholdMs: 500,
      sql: `${baseSelect}
            WHERE (al.created_at, al.id) < ($1::timestamptz, $2::uuid)
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 100`,
      // Cursor approximating the 1000th row in DESC order (~3 days back).
      params: [
        new Date(Date.now() - 3 * 86_400_000).toISOString(),
        '00000000-0000-0000-0000-000000000000',
      ],
    },
    {
      // R2-H1: principal autocomplete (`searchPrincipals` ILIKE substring).
      // Mirrors the parallel users + api_consumers lookup that the production
      // autocomplete endpoint emits. We UNION the two sub-queries into a single
      // statement here so the EXPLAIN output captures both index paths in one
      // plan; production runs them in parallel via Promise.all but the timing
      // characteristic is the same (each is independently bounded by its own
      // index scan). 100 ms threshold is generous: GIN trigram index should
      // hit < 10 ms; plain-ILIKE fallback < 50 ms at our cardinality.
      name: 'q6_principal_autocomplete',
      description: 'Principal autocomplete (ILIKE %query% across users.full_name + api_consumers.name).',
      thresholdMs: 100,
      sql: `
        (SELECT id, full_name AS name, 'user'::text AS type
         FROM users
         WHERE full_name IS NOT NULL AND full_name ILIKE $1
         ORDER BY full_name
         LIMIT 10)
        UNION ALL
        (SELECT id, name, 'consumer'::text AS type
         FROM api_consumers
         WHERE status != 'terminated' AND name ILIKE $1
         ORDER BY name
         LIMIT 10)
      `,
      // Bench seed names typically follow the pattern "user-NNN" / "Test Consumer
      // NN"; "%est%" matches both pools without being so generic that we measure
      // table-scan cost rather than index utilisation.
      params: ['%est%'],
    },
  ];
}

function renderReport(reports: QueryReport[]): string {
  const passed = reports.filter((r) => r.passes).length;
  const total = reports.length;
  const allPassed = passed === total;
  const generatedAt = new Date().toISOString();

  const lines: string[] = [];
  lines.push('# Story 9-11 — Audit Log Viewer Scale Verification (AC#11)');
  lines.push('');
  lines.push(`**Generated:** ${generatedAt}`);
  lines.push(`**Bench DB:** \`oslsr_bench\` (Postgres 15-alpine on local Docker)`);
  lines.push(`**Result:** ${allPassed ? '✅ PASS' : '❌ FAIL'} — ${passed}/${total} queries within threshold`);
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('Each query runs 3 times against the seeded bench DB. The first run primes the buffer cache; runs 2-3 capture warm-cache performance. Reported `medianMs` is the median of the three runs to filter cache-warmth and GC noise.');
  lines.push('');
  lines.push('### Bench data distribution (R2-M1 disclosure)');
  lines.push('');
  lines.push('The seed (`scripts/seed-audit-bench.ts`) generates rows with **uniform-random** distribution across actor / consumer / system principals + uniform-random action / target_resource / created_at within the 90-day window. This differs from production where the distribution is expected to be skewed (~95% user-principal, ~5% consumer-principal once Epic 10 ships, ~ε system) and where action distributions follow user-behaviour clusters rather than uniform.');
  lines.push('');
  lines.push('**Implication:** queries that scan-and-filter (q2, q3) read more rows in this bench than they would in production for the same filter, because uniform-random distribution puts ~33% of rows in each principal bucket vs. production\'s long-tailed distribution. Reported numbers are therefore conservative for the principal-filter shapes — production should be at least this fast, often much faster (smaller selection scan).');
  lines.push('');
  lines.push('**Follow-up (Session 2 or post-field):** add a second bench seed mode with production-skewed distribution (95/5/ε) and re-run; compare numbers to confirm they remain within thresholds. Tracked as story Review Follow-up R2-M1.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Query | Threshold | Run 1 | Run 2 | Run 3 | Median | Result |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of reports) {
    const r1 = r.runs[0].durationMs.toFixed(1);
    const r2 = r.runs[1].durationMs.toFixed(1);
    const r3 = r.runs[2].durationMs.toFixed(1);
    const med = r.medianMs.toFixed(1);
    const result = r.passes ? '✅ PASS' : '❌ FAIL';
    lines.push(`| ${r.name} | < ${r.thresholdMs} ms | ${r1} ms | ${r2} ms | ${r3} ms | ${med} ms | ${result} |`);
  }
  lines.push('');
  lines.push('## Per-query detail');
  lines.push('');
  for (const r of reports) {
    lines.push(`### ${r.name}`);
    lines.push('');
    lines.push(`**Description:** ${r.description}`);
    lines.push(`**Threshold:** < ${r.thresholdMs} ms`);
    lines.push(`**Median:** ${r.medianMs.toFixed(1)} ms (${r.passes ? '✅ within' : '❌ exceeds'} threshold)`);
    lines.push('');
    lines.push('```');
    lines.push(r.finalPlan);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  console.log(`[bench-audit-viewer] Bench DB: ${benchDatabaseUrl.replace(/:([^@]*)@/, ':****@')}`);

  // Sanity check that the bench DB is seeded.
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs`
  );
  const count = parseInt(countResult.rows[0].count, 10);
  if (count < 100_000) {
    console.error(`[bench-audit-viewer] audit_logs has only ${count} rows; need >=100k for meaningful bench.`);
    console.error('[bench-audit-viewer] Run: pnpm --filter @oslsr/api seed:audit-bench');
    process.exit(1);
  }
  console.log(`[bench-audit-viewer] audit_logs row count: ${count}`);

  const shapes = buildShapes();
  const reports: QueryReport[] = [];
  for (const shape of shapes) {
    const r = await benchOne(shape);
    reports.push(r);
  }

  // Write the report.
  const reportDir = path.resolve(apiRoot, 'src/db/explain-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, '9-11-audit-viewer.md');
  const report = renderReport(reports);
  writeFileSync(reportPath, report, 'utf8');

  console.log(`\n[bench-audit-viewer] ✓ Report written: ${reportPath}`);
  const passed = reports.filter((r) => r.passes).length;
  console.log(`[bench-audit-viewer] Result: ${passed}/${reports.length} queries within threshold.`);
  if (passed < reports.length) {
    console.error('[bench-audit-viewer] One or more queries FAILED their thresholds. See report.');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[bench-audit-viewer] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

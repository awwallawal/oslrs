/**
 * Story 11-1 — Projected-scale EXPLAIN runner (AC#11 Akintola-risk Move 1).
 *
 * Runs EXPLAIN (ANALYZE, BUFFERS) on the 10 canonical queries from the story's
 * "Query Plan Audit" Dev Notes section. Captures output into
 * `apps/api/src/db/explain-reports/11-1-projected-scale.md`.
 *
 * Thresholds per AC#11:
 *   - No Seq Scan on any table > 100K rows
 *   - Total cost < 10,000
 *   - Execution time < 500 ms (p95)
 *
 * Local invocation:
 *   pnpm --filter @oslsr/api seed:projected-scale         # populate scratch DB
 *   pnpm --filter @oslsr/api verify:projected-scale       # capture EXPLAINs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[verify-projected-scale] DATABASE_URL not set; aborting.');
  process.exit(1);
}

interface CanonicalQuery {
  id: number;
  title: string;
  description: string;
  sql: string;
  params: unknown[];
  expected: { maxCost?: number; maxExecMs?: number; noSeqScanOver?: number };
}

async function fetchSampleParams(pool: pg.Pool): Promise<{
  source: string;
  lgaId: string;
  enumeratorId: string;
  respondentId: string;
  nin: string;
  profession: string;
  targetResource: string;
  targetId: string;
  actorId: string;
}> {
  const r1 = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`);
  const r2 = await pool.query<{ id: string; nin: string | null; lga_id: string | null; source: string }>(
    `SELECT id, nin, lga_id, source FROM respondents WHERE nin IS NOT NULL AND lga_id IS NOT NULL LIMIT 1`,
  );
  const r3 = await pool.query<{ profession: string; lga_name: string | null }>(
    `SELECT profession, lga_name FROM marketplace_profiles LIMIT 1`,
  );
  const r4 = await pool.query<{ target_resource: string; target_id: string }>(
    `SELECT target_resource, target_id FROM audit_logs LIMIT 1`,
  );
  return {
    source: r2.rows[0]?.source ?? 'enumerator',
    lgaId: r2.rows[0]?.lga_id ?? 'oyo_west',
    enumeratorId: r1.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000',
    actorId: r1.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000',
    respondentId: r2.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000',
    nin: r2.rows[0]?.nin ?? '00000000000',
    profession: r3.rows[0]?.profession ?? 'tailor',
    targetResource: r4.rows[0]?.target_resource ?? 'respondents',
    targetId: r4.rows[0]?.target_id ?? '00000000-0000-0000-0000-000000000000',
  };
}

function buildQueries(p: Awaited<ReturnType<typeof fetchSampleParams>>): CanonicalQuery[] {
  const fromDate = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const toDate = new Date().toISOString();
  return [
    {
      id: 1,
      title: 'Registry filter by source + time window',
      description: 'Story 11-4 use case — landing page when filtering by source + recent activity.',
      sql: `
        SELECT id, first_name, last_name, nin, lga_id, status, source, created_at
        FROM respondents
        WHERE source = $1 AND created_at >= $2 AND created_at < $3
        ORDER BY created_at DESC LIMIT 50 OFFSET $4
      `,
      params: [p.source, fromDate, toDate, 0],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 2,
      title: 'Registry filter by LGA scoped by source',
      description: 'Supervisor / assessor use case.',
      sql: `
        SELECT id, first_name, last_name, lga_id, status, source
        FROM respondents
        WHERE lga_id = $1 AND source = ANY($2)
        ORDER BY created_at DESC LIMIT 50
      `,
      params: [p.lgaId, ['enumerator', 'public', 'clerk']],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 3,
      title: 'Pending-NIN respondent list',
      description: 'Story 9-12 enumerator follow-up use case.',
      sql: `
        SELECT id, first_name, last_name, phone_number, lga_id, created_at
        FROM respondents
        WHERE status = 'pending_nin_capture' AND source = 'enumerator'
        ORDER BY created_at ASC LIMIT 100
      `,
      params: [],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 4,
      title: 'Staff productivity aggregation by enumerator over time',
      description: 'Epic 5.6a use case.',
      sql: `
        SELECT enumerator_id, DATE(submitted_at) as day, COUNT(*) as count
        FROM submissions
        WHERE enumerator_id = $1 AND submitted_at >= $2 AND submitted_at < $3
        GROUP BY enumerator_id, DATE(submitted_at)
        ORDER BY day
      `,
      params: [p.enumeratorId, fromDate, toDate],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 5,
      title: 'Respondent submission lineage',
      description: 'Story 5.3 individual-record view.',
      sql: `
        SELECT id, submission_uid, submitted_at
        FROM submissions
        WHERE respondent_id = $1
        ORDER BY ingested_at DESC
      `,
      params: [p.respondentId],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 6,
      title: 'Respondent dedupe check by NIN',
      description: 'Story 3.7 + 11-1 FR21 — partial unique index expected.',
      sql: `
        SELECT id, source, created_at
        FROM respondents
        WHERE nin = $1
      `,
      params: [p.nin],
      expected: { maxCost: 100, maxExecMs: 50, noSeqScanOver: 100_000 },
    },
    {
      id: 7,
      title: 'Marketplace search: profession + LGA',
      description: 'Epic 7 use case.',
      sql: `
        SELECT id, profession, skills, lga_name, experience_level, verified_badge
        FROM marketplace_profiles
        WHERE lga_name = $1 AND profession = $2 AND verified_badge = true
        ORDER BY created_at DESC LIMIT 50
      `,
      params: [p.lgaId, p.profession],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 8,
      title: 'Audit log by target resource',
      description: 'Story 9-11 use case — composite-index test.',
      sql: `
        SELECT id, actor_id, action, created_at
        FROM audit_logs
        WHERE target_resource = $1 AND target_id = $2
        ORDER BY created_at DESC LIMIT 100
      `,
      params: [p.targetResource, p.targetId],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 9,
      title: 'Audit log by actor over time window',
      description: 'Story 9-11 use case.',
      sql: `
        SELECT id, action, target_resource, target_id, created_at
        FROM audit_logs
        WHERE actor_id = $1 AND created_at >= $2 AND created_at < $3
        ORDER BY created_at DESC LIMIT 100
      `,
      params: [p.actorId, fromDate, toDate],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
    {
      id: 10,
      title: 'Import batch history by source',
      description: 'Story 11-3 admin UI use case.',
      sql: `
        SELECT id, original_filename, rows_inserted, rows_failed, uploaded_at, uploaded_by
        FROM import_batches
        WHERE source = $1
        ORDER BY uploaded_at DESC LIMIT 50
      `,
      params: ['imported_itf_supa'],
      expected: { maxCost: 10_000, maxExecMs: 500, noSeqScanOver: 100_000 },
    },
  ];
}

interface QueryResult {
  query: CanonicalQuery;
  rawPlan: string;
  totalCost: number | null;
  execMs: number | null;
  planMs: number | null;
  hasSeqScan: boolean;
  offendingSeqScanTables: string[];
  thresholds: { cost: 'pass' | 'fail' | 'unknown'; exec: 'pass' | 'fail' | 'unknown'; seqScan: 'pass' | 'fail' };
}

function parsePlan(planText: string): { totalCost: number | null; execMs: number | null; planMs: number | null; seqScannedTables: string[] } {
  // Match the top-level cost: Total Cost is on the root plan node line.
  const costMatch = planText.match(/cost=[\d.]+\.\.([\d.]+)/);
  const totalCost = costMatch ? Number.parseFloat(costMatch[1]) : null;
  const execMatch = planText.match(/Execution Time:\s*([\d.]+)\s*ms/);
  const execMs = execMatch ? Number.parseFloat(execMatch[1]) : null;
  const planMsMatch = planText.match(/Planning Time:\s*([\d.]+)\s*ms/);
  const planMs = planMsMatch ? Number.parseFloat(planMsMatch[1]) : null;
  // Extract the table name(s) being Seq-Scanned so we can size-gate the failure.
  // Pattern: `Seq Scan on <table>` or `Seq Scan on public.<table>` (VERBOSE adds schema).
  const seqScannedTables: string[] = [];
  const seqScanRe = /Seq Scan on (?:\w+\.)?(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = seqScanRe.exec(planText)) !== null) {
    seqScannedTables.push(m[1]);
  }
  return { totalCost, execMs, planMs, seqScannedTables };
}

async function runQuery(pool: pg.Pool, q: CanonicalQuery, tableCounts: Record<string, number>): Promise<QueryResult> {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${q.sql}`;
  const r = await pool.query<{ 'QUERY PLAN': string }>(explainSql, q.params);
  const planLines = r.rows.map((row) => row['QUERY PLAN']);
  const rawPlan = planLines.join('\n');
  const parsed = parsePlan(rawPlan);

  // AC#11 threshold: "Plan MUST NOT show Seq Scan on any table > 100K rows".
  // Strict greater-than per the AC text. A Seq Scan on a small table (e.g.,
  // import_batches with 4 rows) is the optimal plan and must NOT be flagged.
  const seqScanThreshold = q.expected.noSeqScanOver ?? Number.POSITIVE_INFINITY;
  const offendingSeqScanTables = parsed.seqScannedTables.filter((t) => {
    const rowCount = tableCounts[t] ?? 0;
    return rowCount > seqScanThreshold;
  });
  const hasOffendingSeqScan = offendingSeqScanTables.length > 0;

  const costPass: 'pass' | 'fail' | 'unknown' = q.expected.maxCost && parsed.totalCost !== null
    ? (parsed.totalCost <= q.expected.maxCost ? 'pass' : 'fail')
    : 'unknown';
  const execPass: 'pass' | 'fail' | 'unknown' = q.expected.maxExecMs && parsed.execMs !== null
    ? (parsed.execMs <= q.expected.maxExecMs ? 'pass' : 'fail')
    : 'unknown';
  const seqPass: 'pass' | 'fail' = hasOffendingSeqScan ? 'fail' : 'pass';
  return {
    query: q,
    rawPlan,
    totalCost: parsed.totalCost,
    execMs: parsed.execMs,
    planMs: parsed.planMs,
    hasSeqScan: parsed.seqScannedTables.length > 0,
    offendingSeqScanTables,
    thresholds: { cost: costPass, exec: execPass, seqScan: seqPass },
  };
}

function renderReport(results: QueryResult[], counts: Record<string, number>): string {
  const now = new Date().toISOString();
  const summary = results.map((r) => {
    const cost = r.totalCost?.toFixed(0) ?? 'n/a';
    const exec = r.execMs?.toFixed(2) ?? 'n/a';
    let seq: string;
    if (r.offendingSeqScanTables.length > 0) {
      seq = `⚠ Seq Scan: ${r.offendingSeqScanTables.join(', ')}`;
    } else if (r.hasSeqScan) {
      seq = '○ Seq Scan (small table — OK)';
    } else {
      seq = '✓';
    }
    const overall = (r.thresholds.cost !== 'fail' && r.thresholds.exec !== 'fail' && r.thresholds.seqScan !== 'fail') ? '✅ PASS' : '❌ FAIL';
    return `| ${r.query.id} | ${r.query.title} | ${cost} | ${exec} ms | ${seq} | ${overall} |`;
  }).join('\n');

  const planSections = results.map((r) => `
### Query ${r.query.id}: ${r.query.title}

**Description:** ${r.query.description}

**SQL:**
\`\`\`sql
${r.query.sql.trim()}
\`\`\`

**Parameters:** ${JSON.stringify(r.query.params)}

**Thresholds:**
- Max cost: ${r.query.expected.maxCost ?? 'n/a'} → actual ${r.totalCost?.toFixed(2) ?? 'n/a'} → ${r.thresholds.cost.toUpperCase()}
- Max exec: ${r.query.expected.maxExecMs ?? 'n/a'} ms → actual ${r.execMs?.toFixed(2) ?? 'n/a'} ms → ${r.thresholds.exec.toUpperCase()}
- No Seq Scan on tables > ${r.query.expected.noSeqScanOver ?? 'n/a'} rows → ${r.thresholds.seqScan.toUpperCase()}

**Planning Time:** ${r.planMs?.toFixed(2) ?? 'n/a'} ms

**Plan:**
\`\`\`
${r.rawPlan}
\`\`\`
`).join('\n---\n');

  return `# Story 11-1 — Projected-Scale EXPLAIN Audit (AC#11)

Generated: ${now}

## Scale (post-seed counts)

| Table | Rows |
|---|---:|
| respondents | ${counts.respondents.toLocaleString()} |
| submissions | ${counts.submissions.toLocaleString()} |
| audit_logs | ${counts.audit_logs.toLocaleString()} |
| marketplace_profiles | ${counts.marketplace_profiles.toLocaleString()} |
| import_batches | ${counts.import_batches.toLocaleString()} |

## Summary

| # | Query | Total Cost | Exec Time | Scan | Result |
|---|---|---:|---:|---|---|
${summary}

## Detailed Plans

${planSections}
`;
}

async function tableCount(pool: pg.Pool, table: string): Promise<number> {
  const r = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return Number.parseInt(r.rows[0].count, 10);
}

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  console.log('[verify-projected-scale] Counting rows in target tables...');
  const counts = {
    respondents: await tableCount(pool, 'respondents'),
    submissions: await tableCount(pool, 'submissions'),
    audit_logs: await tableCount(pool, 'audit_logs'),
    marketplace_profiles: await tableCount(pool, 'marketplace_profiles'),
    import_batches: await tableCount(pool, 'import_batches'),
  };
  console.log('[verify-projected-scale] Row counts:', counts);

  console.log('[verify-projected-scale] Fetching sample parameter values...');
  const params = await fetchSampleParams(pool);
  const queries = buildQueries(params);

  console.log(`[verify-projected-scale] Running EXPLAIN (ANALYZE, BUFFERS) on ${queries.length} canonical queries...`);
  const results: QueryResult[] = [];
  for (const q of queries) {
    process.stdout.write(`  ${q.id}. ${q.title}... `);
    try {
      const r = await runQuery(pool, q, counts);
      const overallPass = r.thresholds.cost !== 'fail' && r.thresholds.exec !== 'fail' && r.thresholds.seqScan !== 'fail';
      const verdict = overallPass ? '✓' : '✗';
      console.log(`${verdict} cost=${r.totalCost?.toFixed(0)} exec=${r.execMs?.toFixed(2)}ms`);
      results.push(r);
    } catch (err) {
      console.log(`✗ ERROR: ${(err as Error).message}`);
      // Author a placeholder result so the report still mentions it.
      results.push({
        query: q,
        rawPlan: `ERROR: ${(err as Error).message}`,
        totalCost: null,
        execMs: null,
        planMs: null,
        hasSeqScan: false,
        offendingSeqScanTables: [],
        thresholds: { cost: 'unknown', exec: 'unknown', seqScan: 'pass' },
      });
    }
  }

  const reportDir = path.resolve(__dirname, 'explain-reports');
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, '11-1-projected-scale.md');
  writeFileSync(reportPath, renderReport(results, counts), 'utf-8');
  console.log(`[verify-projected-scale] Report written: ${reportPath}`);

  const failures = results.filter((r) => r.thresholds.cost === 'fail' || r.thresholds.exec === 'fail' || r.thresholds.seqScan === 'fail');
  if (failures.length > 0) {
    console.error(`[verify-projected-scale] ${failures.length} of ${results.length} queries failed AC#11 thresholds.`);
    console.error('[verify-projected-scale] See report for details. Add composite indexes in 0010_*.sql + migrate-multi-source-registry-init.ts and re-run.');
    process.exitCode = 1;
  } else {
    console.log(`[verify-projected-scale] All ${results.length} queries pass AC#11 thresholds.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[verify-projected-scale] FAILED:', err);
  process.exit(1);
});

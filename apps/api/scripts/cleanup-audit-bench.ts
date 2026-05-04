/**
 * Story 9-11 — Drop the bench DB created by seed-audit-bench.ts.
 *
 * Returns Awwal's local Postgres to its pre-bench state. `app_db` was never
 * touched by the bench scripts; this just removes the ~1 GB of bench data.
 *
 * Usage:
 *   pnpm --filter @oslsr/api cleanup:audit-bench
 *
 * Requires a connection to the postgres-default DB (admin URL); CREATE/DROP
 * DATABASE cannot run against a DB you're connected to.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) {
  console.error('[cleanup-audit-bench] DATABASE_URL not set; aborting.');
  process.exit(1);
}
const url = new URL(rootUrl);
url.pathname = '/postgres';
const adminUrl = url.toString();

const BENCH_DB_NAME = 'oslsr_bench';

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    const exists = await pool.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname = $1`,
      [BENCH_DB_NAME]
    );
    if (exists.rows.length === 0) {
      console.log(`[cleanup-audit-bench] Database '${BENCH_DB_NAME}' does not exist — nothing to clean up.`);
      return;
    }
    // Terminate any open connections to oslsr_bench before DROP. (Postgres
    // refuses DROP DATABASE while clients are connected.)
    await pool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [BENCH_DB_NAME]
    );
    await pool.query(`DROP DATABASE "${BENCH_DB_NAME}"`);
    console.log(`[cleanup-audit-bench] ✓ Dropped database '${BENCH_DB_NAME}'.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[cleanup-audit-bench] FAILED:', err);
  process.exitCode = 1;
});

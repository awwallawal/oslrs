/**
 * Story 9-62 (Deliverable D) — test-DB anti-clobber guard (pure logic).
 *
 * Why this exists: turbo's `test` task passes the ambient DATABASE_URL through
 * (turbo.json test.env), the API test script is a bare `vitest run`, and
 * db/index.ts THROWS if DATABASE_URL is unset. So on a dev box the pre-push full
 * suite runs against whatever DATABASE_URL points at, which is typically the
 * live UAT `app_db`. The integration teardown deletes/truncates rows, so one
 * wrong env = UAT data loss.
 *
 * SCOPE: this guards the vitest TEST SUITE only (wired as the API package's
 * setupFiles via apps/api/vitest.setup.ts). It deliberately does NOT guard
 * `db:push`/`db:push:force` — the prod deploy legitimately runs `db:push`
 * against the prod database (.github/workflows/ci-cd.yml), so a name-based
 * refusal there would break deploys. For schema pushes, the protection is
 * discipline: always target a scratch DB whose name contains `test`.
 *
 * These functions are pure (no import-time side effects) so they can be unit
 * tested without depending on the live process env. The setup file imports and
 * invokes them against `process.env`.
 */

/** Parse the database name out of a postgres connection string. '' if absent/unparseable. */
export function resolveDbName(databaseUrl: string | undefined): string {
  if (!databaseUrl) return '';
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

/**
 * True when the db name looks like a test database. Boundary-matched so
 * `test_db`, `app_test`, `oslsr_test` match but a real db that merely *contains*
 * the letters t-e-s-t (e.g. `latest`, `greatest`, `contest`) does not.
 */
export function looksLikeTestDb(dbName: string): boolean {
  return /(^|[^a-z])test([^a-z]|$)/i.test(dbName);
}

export interface DbGuardEnv {
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  allowNonTest: boolean;
}

/**
 * Throws when running tests against a database that does not look like a test
 * DB. No-ops outside NODE_ENV=test, when DATABASE_URL is unset/unparseable
 * (db/index.ts owns the unset case), or when explicitly overridden.
 */
export function assertTestDatabase(env: DbGuardEnv): void {
  if (env.nodeEnv !== 'test') return;
  const dbName = resolveDbName(env.databaseUrl);
  if (!dbName) return;
  if (looksLikeTestDb(dbName)) return;
  if (env.allowNonTest) return;

  throw new Error(
    `[db-guard] Refusing to run the test suite against non-test database "${dbName}".\n` +
      `The integration suite deletes/truncates rows and would clobber this database.\n` +
      `Fix: point DATABASE_URL at a scratch DB whose name contains "test" (e.g. app_test):\n` +
      `  docker exec <pg> psql -U <user> -d postgres -c "CREATE DATABASE app_test"\n` +
      `  DATABASE_URL=...//app_test pnpm --filter @oslsr/api db:push:full:force\n` +
      `Then re-run with that DATABASE_URL.\n` +
      `If you REALLY intend to use "${dbName}", set ALLOW_NONTEST_DB=1.`
  );
}

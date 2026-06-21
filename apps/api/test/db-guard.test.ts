import { describe, it, expect } from 'vitest';
import { assertTestDatabase, resolveDbName, looksLikeTestDb } from './db-guard';

/**
 * Story 9-62 (Deliverable D) — test-DB anti-clobber guard.
 * Imports the PURE module (no import-time side effects), so these assertions
 * do not depend on the ambient DATABASE_URL.
 */
describe('test-DB anti-clobber guard', () => {
  const testEnv = { nodeEnv: 'test', allowNonTest: false } as const;
  const url = (db: string) => `postgres://u:p@localhost:5432/${db}`;

  it('allows a database whose name looks like a test DB (CI test_db, local app_test)', () => {
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: url('test_db') })).not.toThrow();
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: url('app_test') })).not.toThrow();
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: url('oslsr_test') })).not.toThrow();
  });

  it('refuses a non-test database (app_db) with actionable guidance', () => {
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: url('app_db') })).toThrow(
      /Refusing to run the test suite against non-test database "app_db"/
    );
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: url('app_db') })).toThrow(/ALLOW_NONTEST_DB=1/);
  });

  it('does not false-positive on names that merely contain the letters t-e-s-t', () => {
    // L1 (review): boundary match — `latest`/`greatest`/`contest` are NOT test DBs.
    expect(looksLikeTestDb('latest')).toBe(false);
    expect(looksLikeTestDb('greatest')).toBe(false);
    expect(looksLikeTestDb('contest_results')).toBe(false);
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: url('latest') })).toThrow(/non-test database "latest"/);
  });

  it('allows a non-test database when ALLOW_NONTEST_DB override is set', () => {
    expect(() =>
      assertTestDatabase({ nodeEnv: 'test', allowNonTest: true, databaseUrl: url('app_db') })
    ).not.toThrow();
  });

  it('no-ops outside NODE_ENV=test (dev/prod never run this guard)', () => {
    expect(() =>
      assertTestDatabase({ nodeEnv: 'development', allowNonTest: false, databaseUrl: url('app_db') })
    ).not.toThrow();
  });

  it('no-ops when DATABASE_URL is unset (db/index.ts owns the unset case)', () => {
    expect(() => assertTestDatabase({ ...testEnv, databaseUrl: undefined })).not.toThrow();
  });

  it('resolveDbName parses the database name, empty for missing/unparseable', () => {
    expect(resolveDbName(url('app_test'))).toBe('app_test');
    expect(resolveDbName(undefined)).toBe('');
    expect(resolveDbName('not-a-url')).toBe('');
  });
});

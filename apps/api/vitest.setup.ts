/**
 * Story 9-62 (Deliverable D) — test-DB anti-clobber guard (setup wiring).
 *
 * Wired as the API package's vitest `setupFiles` (apps/api/vitest.config.ts).
 * Runs before every API test file and refuses to run the suite against a
 * non-test DATABASE_URL. The throw logic is the pure module in ./test/db-guard
 * so it stays unit-testable without this import-time side effect.
 */
import { assertTestDatabase } from './test/db-guard.js';

assertTestDatabase({
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
  allowNonTest: process.env.ALLOW_NONTEST_DB === '1',
});

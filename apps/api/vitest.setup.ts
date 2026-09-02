/**
 * Story 9-62 (Deliverable D) — test-DB anti-clobber guard (setup wiring).
 *
 * Wired as the API package's vitest `setupFiles` (apps/api/vitest.config.ts).
 * Runs before every API test file and refuses to run the suite against a
 * non-test DATABASE_URL. The throw logic is the pure module in ./test/db-guard
 * so it stays unit-testable without this import-time side effect.
 *
 * ── ⛔ THE GUARD FAILED OPEN, AND WAS FIXED HERE (2026-09-02) ────────────────
 *
 * It read `process.env.DATABASE_URL` directly. On the most ordinary local
 * invocation — `pnpm vitest run <file>` with nothing exported in the shell —
 * that is **undefined**, so `resolveDbName` returned '' and the guard hit its
 * `if (!dbName) return;` no-op branch and passed. Then the first test file
 * imported `src/db/index.ts`, which calls `dotenv.config()` on the ROOT `.env`
 * and connects to whatever it names. On this machine that is `app_db` — the dev
 * database.
 *
 * So the guard written to stop the suite clobbering a real database was silently
 * inert in exactly the case it was written for: the env is loaded LAZILY, by the
 * module under test, AFTER the guard has already decided there was nothing to
 * check. A guard that runs before the thing it guards is configured is not a
 * guard.
 *
 * ⚠️ OBSERVED, not theorised: a bare `pnpm vitest run
 * src/services/__tests__/import.service.integration.test.ts` connected to
 * `app_db` and its `afterAll` issued DELETEs there. Nothing was lost — `beforeAll`
 * had already failed on a stale-schema column, so the deletes were scoped to a
 * freshly-minted uuid that matched no rows. The dev database was saved by a
 * schema mismatch, which is luck, not design.
 *
 * ⚠️ THE SAME HOLE IN A SECOND DOORWAY. `.husky/pre-push` carries a comment
 * describing this verbatim; it was fixed there on 2026-07-03 by exporting
 * `DATABASE_URL=app_test` for the gate. Nobody closed the path a developer takes
 * fifty times a day — running one file by hand.
 *
 * ── ⚠️ AND WHY THIS READS THE FILE INSTEAD OF CALLING dotenv.config() ────────
 *
 * The first fix here DID call `dotenv.config()`, and it broke a test inside the
 * hour: `photo-processing.service.test` sets `AWS_REGION` and asserts the S3
 * client is built with it, but the service resolves
 * `S3_REGION || AWS_REGION || 'us-east-1'` — and the root `.env` defines
 * `S3_REGION`. Loading the file put the DEV value in front of the test's own.
 *
 * The lesson generalises past that one test: the guard needs to **know** one
 * variable, not **inject** forty. `dotenv.config()` mutates `process.env` for
 * every API test in the process, so any test whose subject reads a variable the
 * dev `.env` happens to define silently changes behaviour. One test caught it;
 * others may merely have been luckier. `dotenv.parse` reads the same file with no
 * side effects, which is the smallest thing that answers the question asked.
 *
 * An exported `DATABASE_URL` still wins (checked first), so the pre-push gate and
 * `DATABASE_URL=... pnpm vitest` behave exactly as before.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { assertTestDatabase } from './test/db-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Mirrors src/db/index.ts's own resolution: that file sits at apps/api/src/db/
// and walks up four levels; this one sits at apps/api/ and walks up two.
const rootEnvPath = path.resolve(here, '../../.env');

/**
 * The DATABASE_URL the suite will ACTUALLY connect to: an exported value when the
 * caller set one, otherwise whatever `src/db/index.ts` is about to load from the
 * root `.env`. Read-only — nothing here is written back into `process.env`.
 */
function effectiveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    return dotenv.parse(fs.readFileSync(rootEnvPath)).DATABASE_URL;
  } catch {
    // No root .env (CI provisions the URL in the environment). Nothing to
    // resolve here, and `src/db/index.ts` owns the genuinely-unset case.
    return undefined;
  }
}

assertTestDatabase({
  databaseUrl: effectiveDatabaseUrl(),
  nodeEnv: process.env.NODE_ENV,
  allowNonTest: process.env.ALLOW_NONTEST_DB === '1',
});

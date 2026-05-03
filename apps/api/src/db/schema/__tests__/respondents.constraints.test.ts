import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../index.js';
import { respondents } from '../respondents.js';
import { eq, inArray } from 'drizzle-orm';

/**
 * Story 11-1 — DB-level constraint tests for respondents (AC#9 final 3 cases).
 *
 * Verifies the migration's raw-SQL contract holds at the database layer:
 *   1. Partial unique index `respondents_nin_unique_when_present` permits
 *      multiple null-NIN rows (the Story 11-1 relaxation premise).
 *   2. Same partial unique index still rejects duplicate NIN-present rows
 *      (FR21 preservation — scoped, not removed).
 *   3. CHECK constraint `respondents_status_check` rejects invalid statuses.
 *
 * These tests speak to the live local Postgres (DATABASE_URL). They follow
 * the project's integration-test pattern (beforeAll/afterAll, never
 * beforeEach/afterEach) per MEMORY.md "Key Patterns".
 */

const TEST_PREFIX = '_test_11_1_constraints_';

// M3 (code-review 2026-05-03) — cleanup pattern uses `id IN (insertedIds)`
// only. Earlier draft also did `WHERE lgaId LIKE '_test_11_1_constraints_%'`
// as a "best-effort" pre/post sweep, but that pattern silently breaks if a
// future schema migration adds a FK from `respondents.lga_id → lgas.id`
// (test inserts would fail at FK validation before reaching the constraint
// under test). The `insertedIds` array is the authoritative cleanup target.
// TEST_PREFIX is retained for the lga_id values themselves (still a useful
// human-readable marker in case tests do leak data) but no longer used as
// the cleanup query predicate.
describe('respondents DB constraints (Story 11-1)', () => {
  const insertedIds: string[] = [];

  afterAll(async () => {
    if (insertedIds.length > 0) {
      await db.delete(respondents).where(inArray(respondents.id, insertedIds));
    }
  });

  it('partial unique index allows multiple rows with NULL NIN (AC#9.5)', async () => {
    // The whole point of Story 11-1: pending-NIN respondents must coexist.
    const lga = `${TEST_PREFIX}null_nin`;
    const a = await db.insert(respondents).values({
      id: uuidv7(),
      nin: null,
      lgaId: lga,
      status: 'pending_nin_capture',
      source: 'public',
    }).returning({ id: respondents.id });
    const b = await db.insert(respondents).values({
      id: uuidv7(),
      nin: null,
      lgaId: lga,
      status: 'pending_nin_capture',
      source: 'public',
    }).returning({ id: respondents.id });
    const c = await db.insert(respondents).values({
      id: uuidv7(),
      nin: null,
      lgaId: lga,
      status: 'nin_unavailable',
      source: 'imported_other',
    }).returning({ id: respondents.id });

    insertedIds.push(a[0].id, b[0].id, c[0].id);
    expect(a[0].id).not.toBe(b[0].id);
    expect(b[0].id).not.toBe(c[0].id);

    // Confirm via direct count
    const rows = await db.select().from(respondents).where(eq(respondents.lgaId, lga));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      expect(r.nin).toBeNull();
    }
  });

  it('partial unique index rejects duplicate NIN-present rows (FR21 preserved, AC#9.6)', async () => {
    const lga = `${TEST_PREFIX}dup_nin`;
    // Generate a NIN that won't collide with anything else in the dev DB.
    // Story 11-1 doesn't constrain NIN format; for this test any unique 11-digit
    // string works. L3 (code-review 2026-05-03) — use uuidv7-derived digits
    // instead of `Date.now()` so two parallel test runs in the same millisecond
    // don't collide. Take the last 11 digits of the UUID's hex (stripped of
    // non-digits) for guaranteed uniqueness within this test session.
    const uuidDigits = uuidv7().replace(/\D/g, '');
    const sharedNin = `99${uuidDigits.slice(-9)}`;

    const first = await db.insert(respondents).values({
      id: uuidv7(),
      nin: sharedNin,
      lgaId: lga,
      status: 'active',
      source: 'enumerator',
    }).returning({ id: respondents.id });
    insertedIds.push(first[0].id);

    // Second insert with the same NIN must trip the partial unique index
    let threw = false;
    let errMessage = '';
    let errCode: string | undefined;
    try {
      await db.insert(respondents).values({
        id: uuidv7(),
        nin: sharedNin,
        lgaId: lga,
        status: 'active',
        source: 'enumerator',
      });
    } catch (err) {
      threw = true;
      const e = err as { code?: string; cause?: { code?: string }; message?: string };
      errCode = e.code ?? e.cause?.code;
      errMessage = e.message ?? '';
    }
    expect(threw).toBe(true);
    // 23505 = unique_violation. Drizzle wraps the pg error so the code may live
    // on `.cause.code`; the message reliably mentions the index name either way.
    const isUniqueViolation = errCode === '23505'
      || /respondents_nin_unique_when_present/.test(errMessage)
      || /duplicate key value/i.test(errMessage);
    expect(isUniqueViolation).toBe(true);
  });

  it('status CHECK constraint rejects values outside the enum (AC#9.7)', async () => {
    let threw = false;
    let errMessage = '';
    let errCode: string | undefined;
    const id = uuidv7();
    try {
      // Bypass Drizzle typing by issuing raw SQL — Drizzle's enum union
      // narrowing won't allow a literal 'totally_made_up_status' to compile.
      await db.execute(sql`
        INSERT INTO respondents (id, status, source, lga_id, created_at, updated_at)
        VALUES (${id}, 'totally_made_up_status', 'enumerator', ${TEST_PREFIX + 'bad_status'}, now(), now())
      `);
    } catch (err) {
      threw = true;
      const e = err as { code?: string; cause?: { code?: string }; message?: string };
      errCode = e.code ?? e.cause?.code;
      errMessage = e.message ?? '';
    }
    expect(threw).toBe(true);
    // 23514 = check_violation. Drizzle wraps the pg error, so check both the
    // unwrapped code and the message for the constraint name.
    const isCheckViolation = errCode === '23514'
      || /respondents_status_check/.test(errMessage)
      || /check constraint/i.test(errMessage)
      || /violates check/i.test(errMessage);
    if (!isCheckViolation) {
      // Surface the underlying error shape for diagnosis.
      throw new Error(`Unexpected error shape — code=${errCode ?? 'none'} message=${errMessage}`);
    }
    expect(isCheckViolation).toBe(true);
  });

  it('status CHECK constraint accepts each enumerated value', async () => {
    const validStatuses = ['active', 'pending_nin_capture', 'nin_unavailable', 'imported_unverified'] as const;
    for (const s of validStatuses) {
      const r = await db.insert(respondents).values({
        id: uuidv7(),
        nin: null,
        lgaId: `${TEST_PREFIX}status_${s}`,
        status: s,
        source: 'enumerator',
      }).returning({ id: respondents.id });
      insertedIds.push(r[0].id);
      expect(r[0].id).toBeDefined();
    }
  });
});

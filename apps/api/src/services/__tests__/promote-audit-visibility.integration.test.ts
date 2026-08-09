/**
 * Story 13-55 AC3.3 — THE ROUTE THAT PROMOTED PEOPLE INVISIBLY (real DB).
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `MeService.completeNinAuthenticated` (9-61) let a signed-in respondent supply their own NIN from
 * the dashboard. It promoted them to `active` correctly — and wrote `respondent.self_nin_completed`
 * as its only audit row, while the other four promote paths wrote `pending_nin.promoted`.
 *
 * Everything that counts promotions filters on `pending_nin.promoted`:
 * `scripts/reconcile-nin-promotion-audit.ts` (which exists precisely to prove promotions and audit
 * rows agree) and 13-44 AC-T4's digest pair — the monitor 13-53's R2 watch was handed to when its
 * evidence could not be manufactured. So every dashboard NIN completion was counted NOWHERE, and
 * the counter read zero. **A zero that means "this query cannot see it" is indistinguishable from a
 * zero that means "it did not happen"** — the same shape as R21, and the fifth entry in
 * [[pattern-monitor-measuring-something-else]].
 *
 * ── Why this file is an integration test and not a unit test ────────────────
 * The claim is about what lands in `audit_logs`, which is hash-chained and written by
 * `logActionTx` inside the promote's transaction. A mock can only prove the call was made. The
 * defect here was never a missing call — 9-61 always called the audit service. It was that the
 * row it wrote carried an action nobody queried. Only the ROW can show that.
 *
 * ⚠️ It asserts on rows scoped to ITS OWN respondent, never on global counts: this suite shares
 * `app_test` with the rest of the API tests and a global count would be a different test on every
 * run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and, inArray } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, roles, respondents, auditLogs } from '../../db/schema/index.js';
import { AUDIT_ACTIONS } from '../audit.service.js';
import { MeService } from '../me.service.js';

/**
 * Review L1 — RANDOM, not `hrtime % 100000`.
 *
 * The first cut derived every unique value from `process.hrtime.bigint() % 100000n`, which collapsed
 * the NIN into `10000000000–10000099999` — 100k values behind a PARTIAL UNIQUE INDEX on
 * `respondents.nin`. Any run that dies before `afterAll` leaves a row that a later run collides
 * with, and the collision surfaces as a `NIN_DUPLICATE` 409 from deep inside the service: debris
 * wearing the costume of a flake. `randomInt` spans the whole 11-digit space instead.
 */
const stamp = randomInt(0, 100_000);
const email = `promote-visibility-${randomInt(0, 1_000_000_000)}@example.com`;
/** Digits only, 11 long — format-only per 13-15; no checksum exists for NINs. */
const nin = String(randomInt(10_000_000_000, 100_000_000_000));

let userId = '';
let respondentId = '';

beforeAll(async () => {
  await db
    .insert(roles)
    .values([{ name: 'public_user', description: 'Public User' }])
    .onConflictDoNothing();
  const publicRole = await db.query.roles.findFirst({ where: eq(roles.name, 'public_user') });

  const [u] = await db
    .insert(users)
    .values({ email, fullName: 'Promote Visibility', roleId: publicRole!.id, status: 'active' })
    .returning({ id: users.id });
  userId = u.id;

  const [r] = await db
    .insert(respondents)
    .values({
      firstName: 'Visible',
      lastName: 'Promote',
      // `chk_respondents_phone_number_e164` — +234 then exactly 10 digits. Review L1: random
      // across the whole 8xxxxxxxxx block rather than a 100k slice of it.
      phoneNumber: `+234${randomInt(8_000_000_000, 9_000_000_000)}`,
      lgaId: 'lga-egbeda',
      source: 'public',
      status: 'pending_nin_capture',
      userId,
      referenceCode: `OSL-2026-V${String(stamp).padStart(5, '0')}`,
    })
    .returning({ id: respondents.id });
  respondentId = r.id;
}, 30000);

afterAll(async () => {
  if (respondentId) {
    await db.delete(auditLogs).where(eq(auditLogs.targetId, respondentId));
    await db.delete(respondents).where(eq(respondents.id, respondentId));
  }
  if (userId) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userId]));
    await db.delete(users).where(eq(users.id, userId));
  }
});

describe('13-55 AC3.3 — the authenticated dashboard promote is COUNTABLE', () => {
  it('writes pending_nin.promoted AND keeps respondent.self_nin_completed', async () => {
    const res = await MeService.completeNinAuthenticated({ userId, email, nin });
    expect(res.state).toBe('complete');

    // The promotion itself still happens exactly as 9-61 shipped it.
    const after = await db.query.respondents.findFirst({
      where: eq(respondents.id, respondentId),
      columns: { status: true, nin: true },
    });
    expect(after?.status).toBe('active');
    expect(after?.nin).toBe(nin);

    const rows = await db
      .select({ action: auditLogs.action, details: auditLogs.details })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, respondentId));
    const actions = rows.map((r) => r.action);

    /**
     * THE FIX. Before 13-55 this array held ONLY `respondent.self_nin_completed`, so the reconcile
     * script and the 13-44 digest — both keyed on `pending_nin.promoted` — could not see that a
     * citizen had been promoted at all.
     */
    expect(actions).toContain(AUDIT_ACTIONS.PENDING_NIN_PROMOTED);

    /**
     * …AND THE 9-61 ROW SURVIVES. Retiring an audit action is a data decision for its own story:
     * anything already reading `respondent.self_nin_completed` must keep working. Adding a row is
     * safe; removing one is not, and a refactor is not the place to decide it.
     */
    expect(actions).toContain(AUDIT_ACTIONS.RESPONDENT_SELF_NIN_COMPLETED);

    // The promote row is attributable to THIS route — AC1.3, which was breached before this story.
    const promoted = rows.find((r) => r.action === AUDIT_ACTIONS.PENDING_NIN_PROMOTED);
    expect((promoted?.details as Record<string, unknown>)?.trigger).toBe(
      'authenticated_dashboard_nin',
    );
  });

  /**
   * AC3.2 — the `nin IS NULL` predicate this path never had, exercised WHERE IT IS THE ONLY THING
   * STANDING IN THE WAY.
   *
   * ⚠️ THE OBVIOUS VERSION OF THIS TEST PROVES NOTHING, and it was written that way first: calling
   * `completeNinAuthenticated` twice returns 409 both before and after this story, because the
   * service's own `r.status !== 'pending_nin_capture'` pre-check throws on the second call and the
   * SQL is never reached. Measured — with the predicate deleted, that version still passed. It
   * asserted the safe OUTCOME while never touching the guard, which is exactly
   * [[pattern-test-that-passes-over-a-hole]].
   *
   * So this drives the state the predicate actually defends: a row that is STILL
   * `pending_nin_capture` and ALREADY holds a NIN. That combination is the unwritten invariant
   * 9-61 relied on — the caller's status check waves it straight through, and only the database
   * can refuse it. Overwriting a national identity number is the harm; two different NINs are a
   * conflict for a human, never a silent write.
   */
  it('refuses to overwrite a NIN on a row the caller still thinks is pending', async () => {
    /**
     * Review L2 — this test SEEDS the state it needs instead of inheriting it.
     *
     * It used to rely on the test above having promoted the row, then assert the absolute
     * `toHaveLength(1)`. Two problems: running this test alone (`-t 'refuses to overwrite'`) failed
     * on a precondition rather than on the property, and the count assertion was really measuring
     * its neighbour. Both are fixed by writing the row into the exact state under test and
     * measuring the DELTA across the attempt.
     */
    await db
      .update(respondents)
      // Force the state the invariant says cannot happen: still pending, but ALREADY holding a NIN.
      // The caller's own `status !== 'pending_nin_capture'` pre-check waves this straight through,
      // so the `nin IS NULL` predicate in the UPDATE is the only thing that can refuse it.
      .set({ status: 'pending_nin_capture', nin })
      .where(eq(respondents.id, respondentId));

    const promoteRows = () =>
      db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.targetId, respondentId),
            eq(auditLogs.action, AUDIT_ACTIONS.PENDING_NIN_PROMOTED),
          ),
        );
    const before = (await promoteRows()).length;

    const differentNin = String(Number(nin) === 99_999_999_999 ? 10_000_000_001 : Number(nin) + 1);
    await expect(
      MeService.completeNinAuthenticated({ userId, email, nin: differentNin }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // The held NIN is untouched…
    const after = await db.query.respondents.findFirst({
      where: eq(respondents.id, respondentId),
      columns: { nin: true },
    });
    expect(after?.nin).toBe(nin);

    // …and the refusal wrote NO new promote row. A delta, so this holds however the file is run.
    expect((await promoteRows()).length).toBe(before);
  });
});

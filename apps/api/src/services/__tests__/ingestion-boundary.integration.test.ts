/**
 * Story 13-57 AC1.5 / AC2.1 — THE INGESTION BOUNDARY, AGAINST THE REAL COLUMN.
 *
 * ── Why this runs against Postgres and not a mock ───────────────────────────
 * The defect this story closes is a CONTRACT COLLISION between two things a
 * mock cannot hold at once: `normaliseNigerianPhone` returns the RAW input when
 * it cannot canonicalise (by design, so a back-fill can flag the row), and
 * `respondents.phone_number` carries
 * `CHECK (phone_number IS NULL OR phone_number ~ '^\+234\d{10}$')`.
 * A mocked insert accepts anything, so a mocked test would have stayed green
 * through the entire five days those two rows sat dead on production. The
 * constraint IS the specification here, so the constraint has to be present.
 *
 * ── The two numbers are not illustrative, they are the incident ─────────────
 *   `+234 08120004038`  Rosemary, 2026-08-04 06:24 — derived an 11-digit NSN,
 *                       tripped `wrong_length`, and the raw string was written
 *                       into the CHECK-constrained column. The insert threw and
 *                       the submission was left `processed = false` with no
 *                       reason recorded and no alert.
 *   `07051286580`       Adekemi, 2026-08-04 09:17 — ordinary local format,
 *                       which already normalised correctly. It is here as the
 *                       control: if this one ever reds, the fix has broken the
 *                       common case rather than the edge one.
 *
 * ⚠️ NOBODY WAS LOST. Both people were already registered by other routes (see
 * the story's first CORRECTION block). This is about an ingestion boundary that
 * accepted input it could not store and failed silently — not a rescue.
 *
 * ── What each test asserts, and what it deliberately does not ───────────────
 * Assertions are on ROWS, never on mock calls ([[pattern-test-that-passes-over-
 * a-hole]]). Every test owns its own randomly-generated identity so no test can
 * read a row another test wrote, and teardown reads its DELETE count because a
 * `DELETE 0` is a failed teardown, not a clean one.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/respondents.js';
import { submissions } from '../../db/schema/submissions.js';
import {
  SubmissionProcessingService,
  PermanentProcessingError,
} from '../submission-processing.service.js';
import { getIngestionHealth } from '../operations.service.js';
import { acknowledgeUnprocessableSubmission } from '../submission-terminal-state.js';

function digits(count: number): string {
  let out = '';
  while (out.length < count) out += randomUUID().replace(/\D/g, '');
  return out.slice(0, count);
}

/** A name nobody else in `app_test` holds, so the row set under test is only ours. */
const uniqueName = (): string => `Zz${digits(10)}`;

const createdIds = new Set<string>();
const createdSubmissionIds = new Set<string>();

async function ingest(input: {
  firstName: string;
  lastName: string;
  phoneNumber: string;
}): Promise<{ id: string; _isNew: boolean }> {
  const result = await SubmissionProcessingService.findOrCreateRespondent(
    {
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: input.phoneNumber,
      consentMarketplace: false,
      consentEnriched: false,
    },
    // `public` deliberately: the staff-captured sources are exempt from the
    // identity merge (13-4 AC1b), and the merge is what test 2 measures.
    'public',
    undefined,
  );
  createdIds.add(result.id);
  return result;
}

async function rowsNamed(firstName: string) {
  return db
    .select({ id: respondents.id, phoneNumber: respondents.phoneNumber })
    .from(respondents)
    .where(eq(respondents.firstName, firstName))
    .orderBy(respondents.createdAt);
}

afterAll(async () => {
  // Child-first: submissions reference respondents. Both counts are READ —
  // a `DELETE 0` is a failed teardown, not a clean one (playbook §2h).
  if (createdSubmissionIds.size > 0) {
    const subIds = [...createdSubmissionIds];
    const deletedSubs = await db
      .delete(submissions)
      .where(inArray(submissions.id, subIds))
      .returning({ id: submissions.id });
    expect(deletedSubs.length).toBe(subIds.length);
  }
  if (createdIds.size === 0) return;
  const ids = [...createdIds];
  const deleted = await db
    .delete(respondents)
    .where(inArray(respondents.id, ids))
    .returning({ id: respondents.id });
  expect(deleted.length).toBe(ids.length);
});

describe('Story 13-57 — the ingestion boundary (real DB)', () => {
  it('AC1.5 — `+234 08120004038` lands ONE respondent at +2348120004038', async () => {
    const firstName = uniqueName();
    const created = await ingest({
      firstName,
      lastName: 'Oko',
      phoneNumber: '+234 08120004038',
    });

    expect(created._isNew).toBe(true);
    const rows = await rowsNamed(firstName);
    expect(rows).toHaveLength(1);
    expect(rows[0].phoneNumber).toBe('+2348120004038');
  });

  it('AC1.5 — `07051286580` lands ONE respondent at +2347051286580', async () => {
    const firstName = uniqueName();
    const created = await ingest({
      firstName,
      lastName: 'Salaudeen',
      phoneNumber: '07051286580',
    });

    expect(created._isNew).toBe(true);
    const rows = await rowsNamed(firstName);
    expect(rows).toHaveLength(1);
    expect(rows[0].phoneNumber).toBe('+2347051286580');
  });

  /**
   * AC1.2 — "must all resolve to ONE E.164 value" is a claim about identity, not
   * about string formatting, and this is the test that makes it one. The same
   * person submits twice, spelling their number the two ways a Nigerian writes
   * it; if either spelling survived un-normalised, the no-NIN identity guard
   * (which matches on `phone_number`) could not see the first row and would
   * mint a second record with a second reference code — the 2026-08-04
   * duplicate-registration shape, arriving by a different door.
   */
  it('AC1.2 — the local and country-coded spellings are recognised as ONE person', async () => {
    const firstName = uniqueName();
    const lastName = 'Adewale';

    const first = await ingest({ firstName, lastName, phoneNumber: '08120004038' });
    const second = await ingest({ firstName, lastName, phoneNumber: '+234 08120004038' });

    expect(first._isNew).toBe(true);
    expect(second._isNew).toBe(false);
    expect(second.id).toBe(first.id);

    const rows = await rowsNamed(firstName);
    expect(rows).toHaveLength(1);
    expect(rows[0].phoneNumber).toBe('+2348120004038');
  });

  /**
   * AC1.1 + AC2.1 — a number with no derivable ten digits is refused BEFORE the
   * insert, with a reason, and leaves no partial row behind.
   *
   * `PermanentProcessingError` is the load-bearing part of the assertion, not
   * decoration: it is what tells the queue worker to record the reason and stop
   * retrying instead of re-throwing for a BullMQ retry that can never succeed —
   * and it was the missing classification that left the two orphans sitting at
   * `processed = false` looking exactly like rows still waiting their turn.
   */
  it('AC1.1 — an un-canonicalisable number is refused with a reason and writes nothing', async () => {
    const firstName = uniqueName();

    await expect(
      ingest({ firstName, lastName: 'Nobody', phoneNumber: '080123456' }),
    ).rejects.toThrow(PermanentProcessingError);

    await expect(
      ingest({ firstName, lastName: 'Nobody', phoneNumber: '080123456' }),
    ).rejects.toThrow(/UNPROCESSABLE_INPUT: phone_number \(wrong_length/);

    expect(await rowsNamed(firstName)).toHaveLength(0);
  });

  /**
   * The normaliser warns on an unrecognised mobile prefix but the value it
   * returns is perfectly storable. A guard written against the WARNING LIST
   * rather than the OUTPUT SHAPE would reject this row and lock out every new
   * prefix the NCC ever issues — so this pins that the guard reads the shape.
   */
  /**
   * ⭐ AC3 — THE COUNT, AGAINST REAL ROWS IN ALL FOUR STATES.
   *
   * This is where the digest signal and the supervisor's operator counter both
   * earn their keep, because both build their filters from the SAME two
   * exported predicate strings (`SQL_SUBMISSION_DEAD` /
   * `SQL_SUBMISSION_AWAITING`). Each surface previously wrote its own, and one
   * of them narrowed to `processed = true` — becoming structurally incapable of
   * counting the very failures it was named after. A test over one hand-written
   * copy would have proved nothing about the other
   * ([[pattern-census-counts-sites-not-callers]]); a test over the shared
   * definition constrains both.
   *
   * Asserted as DELTAS, not absolutes: `app_test` is shared with every other
   * suite, so an absolute count would be a flake waiting for a neighbour.
   */
  it('AC3 — counts the dead and the stuck, and leaves the healthy and the fresh alone', async () => {
    const before = await getIngestionHealth();
    expect(before, 'getIngestionHealth must not fail-open during its own test').not.toBeNull();

    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000);
    const rows = [
      // DEAD — terminal, with a reason. The state this story creates.
      {
        processed: true,
        processedAt: new Date(),
        processingError: 'UNPROCESSABLE_INPUT: phone_number (wrong_length:expected_10_got_11)',
        ingestedAt: threeHoursAgo,
      },
      // STUCK — the pre-13-57 shape, and the state the two 2026-08-04 orphans
      // are in to this day: no reason was ever recorded, and inventing one now
      // would be a guess dressed as a fact.
      { processed: false, processedAt: null, processingError: null, ingestedAt: threeHoursAgo },
      // FRESH — not processed, but seconds old. A row still working its way
      // through the queue is NOT a finding; without the age floor this would
      // make the digest cry about normal traffic every morning.
      { processed: false, processedAt: null, processingError: null, ingestedAt: new Date() },
      // HEALTHY — processed, no reason. Must never be counted.
      { processed: true, processedAt: new Date(), processingError: null, ingestedAt: threeHoursAgo },
    ];

    for (const row of rows) {
      const [inserted] = await db
        .insert(submissions)
        .values({
          submissionUid: `13-57-test-${randomUUID()}`,
          questionnaireFormId: 'form-13-57-test',
          submittedAt: row.ingestedAt,
          source: 'enumerator',
          ...row,
        })
        .returning({ id: submissions.id });
      createdSubmissionIds.add(inserted.id);
    }

    const after = await getIngestionHealth();
    expect(after).not.toBeNull();

    expect(after!.dead - before!.dead).toBe(1);
    expect(after!.stuck - before!.stuck).toBe(1);
    // The fresh row and the healthy row contributed nothing between them.
    expect(after!.dead + after!.stuck - (before!.dead + before!.stuck)).toBe(2);
    // Neither of the two excluded buckets moved — nothing here is a duplicate
    // rejection and nothing has been acknowledged.
    expect(after!.deduplicated - before!.deduplicated).toBe(0);
    expect(after!.acknowledged - before!.acknowledged).toBe(0);

    // The age clock runs from `ingested_at` — when WE received it — not from the
    // client-stamped `submitted_at`, which an offline device can put days out.
    expect(after!.oldestAt).not.toBeNull();
    expect(new Date(after!.oldestAt!).getTime()).toBeLessThanOrEqual(threeHoursAgo.getTime() + 1000);
    expect(after!.oldestAgeHours).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⭐ CODE REVIEW 2026-08-14 (H1) — MEASURED AGAINST REAL ROWS, BECAUSE THE
   * CLAIM IS ABOUT PEOPLE.
   *
   * The digest says "these people are NOT on the register". A duplicate-NIN
   * rejection is a terminal row carrying a reason whose own text reads
   * "already registered on <date> via <source>" — the person IS on the
   * register. Counting it under that sentence is inferring IMPACT from
   * STRUCTURE, the error this story retracted three times, rebuilt into the
   * monitor meant to prevent it. After the jingle it would have been the bulk
   * of the count.
   *
   * ⛔ NEUTER-CHECK: drop the `NOT LIKE 'NIN_DUPLICATE%'` clause from
   * `SQL_SUBMISSION_DEAD` and the `dead` delta becomes 1 instead of 0.
   */
  it('H1 — a duplicate-NIN rejection is counted separately and never as a loss', async () => {
    const before = await getIngestionHealth();
    expect(before).not.toBeNull();

    const [row] = await db
      .insert(submissions)
      .values({
        submissionUid: `13-57-dupe-${randomUUID()}`,
        questionnaireFormId: 'form-13-57-test',
        submittedAt: new Date(Date.now() - 3 * 3_600_000),
        ingestedAt: new Date(Date.now() - 3 * 3_600_000),
        source: 'enumerator',
        processed: true,
        processedAt: new Date(),
        // The verbatim shape `findOrCreateRespondent` throws (`:683`).
        processingError:
          'NIN_DUPLICATE: This individual was already registered on 2026-08-04T09:04:00.000Z via public',
      })
      .returning({ id: submissions.id });
    createdSubmissionIds.add(row.id);

    const after = await getIngestionHealth();
    expect(after!.deduplicated - before!.deduplicated).toBe(1);
    expect(after!.dead - before!.dead).toBe(0);
    expect(after!.stuck - before!.stuck).toBe(0);
  });

  /**
   * ⭐ CODE REVIEW 2026-08-14 (H2) — THE COUNT HAS TO BE ABLE TO GO DOWN.
   *
   * Shipped without this, DEAD had no upper bound in time and no resolution
   * state: an operator who read the reason, phoned the citizen and registered
   * them by hand still got the same 🔴 twice a day forever. With the two known
   * 2026-08-04 orphans already ten days old, the FIRST digest after deploy
   * would have been red and so would every one after it.
   *
   * ⚠️ Asserted on the ROW, not on the return value — and specifically that the
   * ORIGINAL reason survives behind the marker, because an acknowledgement is a
   * statement about the operator, never a diagnosis invented for the row.
   */
  it('H2 — acknowledging a dead row clears it from the count and keeps its reason', async () => {
    const originalReason = 'UNPROCESSABLE_INPUT: phone_number (wrong_length:expected_10_got_11)';
    const [row] = await db
      .insert(submissions)
      .values({
        submissionUid: `13-57-ack-${randomUUID()}`,
        questionnaireFormId: 'form-13-57-test',
        submittedAt: new Date(Date.now() - 5 * 3_600_000),
        ingestedAt: new Date(Date.now() - 5 * 3_600_000),
        source: 'enumerator',
        processed: true,
        processedAt: new Date(),
        processingError: originalReason,
      })
      .returning({ id: submissions.id });
    createdSubmissionIds.add(row.id);

    const withDead = await getIngestionHealth();

    const result = await acknowledgeUnprocessableSubmission({
      submissionId: row.id,
      note: 'registered by hand, OSL-2026-ERX8SD',
    });
    expect(result.acknowledged).toBe(true);

    const afterAck = await getIngestionHealth();
    expect(afterAck!.dead - withDead!.dead).toBe(-1);
    expect(afterAck!.acknowledged - withDead!.acknowledged).toBe(1);

    // The original reason is still readable — nothing was destroyed.
    const [stored] = await db
      .select({ processingError: submissions.processingError })
      .from(submissions)
      .where(eq(submissions.id, row.id));
    expect(stored.processingError).toContain('ACKNOWLEDGED:');
    expect(stored.processingError).toContain('registered by hand, OSL-2026-ERX8SD');
    expect(stored.processingError).toContain(originalReason);

    // Idempotent: acknowledging twice writes nothing the second time.
    const again = await acknowledgeUnprocessableSubmission({
      submissionId: row.id,
      note: 'again',
    });
    expect(again.acknowledged).toBe(false);
    expect(again.skipped).toBe('already_acknowledged');
  });

  /**
   * A STUCK row carries no reason and never will — nothing recorded one. It
   * still has to be dischargeable, or R1's two 2026-08-04 orphans nag forever;
   * and the marker has to say plainly that no cause was known, rather than
   * inventing one. That distinction is the whole reason R1 stayed open.
   */
  it('H2 — a STUCK row can be closed out without inventing a cause for it', async () => {
    const [row] = await db
      .insert(submissions)
      .values({
        submissionUid: `13-57-ack-stuck-${randomUUID()}`,
        questionnaireFormId: 'form-13-57-test',
        submittedAt: new Date(Date.now() - 6 * 3_600_000),
        ingestedAt: new Date(Date.now() - 6 * 3_600_000),
        source: 'enumerator',
        processed: false,
      })
      .returning({ id: submissions.id });
    createdSubmissionIds.add(row.id);

    const withStuck = await getIngestionHealth();
    const result = await acknowledgeUnprocessableSubmission({
      submissionId: row.id,
      note: 'both people confirmed on the register; see story R1',
    });
    expect(result.acknowledged).toBe(true);
    expect(result.reason).toContain('(no reason was ever recorded)');

    const afterAck = await getIngestionHealth();
    expect(afterAck!.stuck - withStuck!.stuck).toBe(-1);
    expect(afterAck!.acknowledged - withStuck!.acknowledged).toBe(1);
  });

  /**
   * ⭐ CODE REVIEW 2026-08-14 (M1) — AC2.2 asks for "the constraint that
   * rejected it", and the guard throws BEFORE the insert, so Postgres never
   * gets to name one. The thrower names it instead; without this the field the
   * AC asked for was `null` for exactly the failure class it was written about.
   */
  it('M1 — the refusal carries the constraint that would have rejected it', async () => {
    const firstName = uniqueName();
    try {
      await ingest({ firstName, lastName: 'Constraint', phoneNumber: '080123456' });
      expect.unreachable('the unstorable phone should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(PermanentProcessingError);
      expect((error as PermanentProcessingError).constraint).toBe(
        'chk_respondents_phone_number_e164',
      );
    }
  });

  it('AC1.1 — an unknown-but-well-formed mobile prefix is still stored', async () => {
    const firstName = uniqueName();
    const created = await ingest({
      firstName,
      lastName: 'Prefix',
      phoneNumber: '+2345012345678',
    });

    expect(created._isNew).toBe(true);
    const rows = await rowsNamed(firstName);
    expect(rows).toHaveLength(1);
    expect(rows[0].phoneNumber).toBe('+2345012345678');
  });
});

/**
 * Story 13-54 AC3 — THE NEGATIVE CONTROL for the NIN-arrival seam.
 *
 * ── What this file is for ───────────────────────────────────────────────────
 * 13-53 closed the seam where a person who registers WITHOUT a NIN and comes
 * back WITH one ended up with two records and two reference numbers. Its
 * strongest evidence was a sentence in Completion Notes describing something a
 * human did once by hand: "neuter the promote and the duplicate comes back."
 *
 * Every count in that story's baseline was already zero, so ABSENCE proves
 * nothing — a guard that works and a guard that never runs produce identical
 * green. The only thing that distinguishes them is removing the guard and
 * watching the bug return. This file does that, on every push.
 *
 * ── MECHANISM CHANGED 2026-08-08 (adjudication) ─────────────────────────────
 * AC3.1 specified `--negative-control` on `nin-arrival:smoke`, neutering the
 * promote in-process. That is IMPOSSIBLE. ESM namespace exports are read-only,
 * non-configurable bindings — measured:
 *
 *     Cannot assign to read only property
 *     'promoteRespondentWithArrivingNin' of object '[object Module]'
 *
 * and a direct import binding could not be patched even if the namespace were
 * writable. `tsx` cannot do this; vitest can, because it controls module
 * resolution. The rejected alternative was a test-only injection seam in
 * production `respondent-identity.ts` — a supported, env-gated way to disable a
 * citizen-data safety guard, added inside the very story whose purpose is to
 * make bypasses impossible. Ruled out on principle, not cost.
 *
 * ── The three constraints this file is built to satisfy ─────────────────────
 * 1. Integration against the REAL test DB. Only `promoteRespondentWithArrivingNin`
 *    is mocked — the ingestion path (`findOrCreateRespondent`), the identity
 *    finder and Postgres all stay real.
 * 2. ⚠️ ASSERT ON ROWS, NEVER ON MOCK CALLS. The property under test is "remove
 *    the guard and the duplicate comes back": two respondent rows on one phone,
 *    carrying different reference codes. A test asserting the mock was or was
 *    not called proves the MOCK works, not that the GUARD does — that
 *    substitution is [[pattern-test-that-passes-over-a-hole]], and this story
 *    exists to end that class. There is not a single `toHaveBeenCalled` below.
 * 3. The negative control is PAIRED with its un-mocked twin. A negative control
 *    alone pins one direction only.
 *
 * ── Order-independence (13-53 review M3) ────────────────────────────────────
 * Each test owns its OWN phones, creates its OWN rows, and sets its own mock
 * state explicitly at the top. No test reads a row another test wrote.
 *
 * ⚠️ This claim was FALSE until the 13-54 code review (H2) and the file was one
 * shuffle away from proving it. The third test used to read the phones written
 * by the first two, so any order but `1,2,3` / `2,1,3` failed — measured, at
 * `--sequence.shuffle.tests --sequence.seed=3`:
 *
 *     AssertionError: expected { guarded: +0, neutered: +0 }
 *                     to deeply equal { guarded: 1, neutered: 2 }
 *
 * That is exactly the 13-53 review M3 coupling this header cited as the thing
 * it was defending against. It now runs its own paired journeys instead.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/respondents.js';

vi.mock('../respondent-identity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../respondent-identity.js')>();
  return { ...actual, promoteRespondentWithArrivingNin: vi.fn(actual.promoteRespondentWithArrivingNin) };
});

const { promoteRespondentWithArrivingNin } = await import('../respondent-identity.js');
const { SubmissionProcessingService } = await import('../submission-processing.service.js');
const actualIdentity =
  await vi.importActual<typeof import('../respondent-identity.js')>('../respondent-identity.js');

/**
 * Random digits, not a clock slice.
 *
 * Review M3 — this was `Date.now().toString().slice(-7)`, an identity namespace
 * that recycles every 10^7 ms (~2.8 hours). A failed teardown, a second
 * developer on the same `app_test`, or a CI re-run inside that window leaves
 * rows sitting on the phone the next run picks, and `toHaveLength(1)` then fails
 * as a mystery rather than as a finding. The rows this file asserts on must be
 * ONLY the rows this run created.
 */
function digits(count: number): string {
  let out = '';
  while (out.length < count) out += randomUUID().replace(/\D/g, '');
  return out.slice(0, count);
}

/** `chk_respondents_phone_number_e164` requires +234 followed by exactly 10 digits. */
const phone = (): string => `+2348${digits(9)}`;
/** 11 digits, format-only — the project deliberately runs no checksum gate (13-15). */
const nin = (): string => digits(11);

const createdIds = new Set<string>();

/**
 * The journey the register actually asks people to take: register with no NIN,
 * come back with one — surname-first and a middle name dropped, which is how
 * Nigerian names are re-entered and the exact shape strict first+last equality
 * misses (0 of 4 real collisions caught).
 */
async function twoPassJourney(phoneNumber: string, arrivingNin: string): Promise<void> {
  const first = await SubmissionProcessingService.findOrCreateRespondent(
    {
      firstName: 'Bashiru',
      lastName: 'Yusuff Titilope',
      phoneNumber,
      consentMarketplace: false,
      consentEnriched: false,
    },
    'public',
    undefined,
  );
  createdIds.add(first.id);

  const second = await SubmissionProcessingService.findOrCreateRespondent(
    {
      nin: arrivingNin,
      firstName: 'Yusuff',
      lastName: 'Bashiru',
      phoneNumber,
      consentMarketplace: false,
      consentEnriched: false,
    },
    'public',
    undefined,
  );
  createdIds.add(second.id);
}

/**
 * The ROWS. This is the assertion surface — not the mock.
 *
 * Review L3 — was a raw `db.execute` behind an `as unknown as { rows }` cast,
 * i.e. the unguarded-cast class Story 13-41 exists to catch, inside the story
 * that exists to close defect classes. The typed builder needs no cast and
 * fails at `tsc` if a column is renamed.
 */
async function rowsOnPhone(phoneNumber: string): Promise<Array<{ id: string; referenceCode: string | null }>> {
  return db
    .select({ id: respondents.id, referenceCode: respondents.referenceCode })
    .from(respondents)
    .where(eq(respondents.phoneNumber, phoneNumber))
    .orderBy(respondents.createdAt);
}

afterAll(async () => {
  if (createdIds.size === 0) return;
  const ids = [...createdIds];
  const deleted = await db.delete(respondents).where(inArray(respondents.id, ids)).returning({ id: respondents.id });
  // Task 5.5 — read the count. A DELETE 0 is a failed teardown, not a clean one.
  expect(deleted.length).toBe(ids.length);
});

/** Run the journey with the real promote in place. */
async function runGuarded(phoneNumber: string): Promise<Array<{ id: string; referenceCode: string | null }>> {
  vi.mocked(promoteRespondentWithArrivingNin).mockImplementation(
    actualIdentity.promoteRespondentWithArrivingNin,
  );
  await twoPassJourney(phoneNumber, nin());
  return rowsOnPhone(phoneNumber);
}

/**
 * Run the journey with the promote neutered. `promotedByIdentity` falsy →
 * submission-processing falls through to the fresh-insert path, which is
 * precisely what happened to OSL-2026-56C9PG / OSL-2026-W1PS38 on 2026-08-07.
 */
async function runNeutered(phoneNumber: string): Promise<Array<{ id: string; referenceCode: string | null }>> {
  vi.mocked(promoteRespondentWithArrivingNin).mockResolvedValue(null);
  await twoPassJourney(phoneNumber, nin());
  return rowsOnPhone(phoneNumber);
}

describe('NIN-arrival seam — negative control (13-54 AC3)', () => {
  it('GUARDED (the positive twin): the journey produces ONE record, keeping the original code', async () => {
    const phoneNumber = phone();
    const guardedNin = nin();

    vi.mocked(promoteRespondentWithArrivingNin).mockImplementation(
      actualIdentity.promoteRespondentWithArrivingNin,
    );

    await twoPassJourney(phoneNumber, guardedNin);

    const rows = await rowsOnPhone(phoneNumber);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row?.referenceCode).toBeTruthy();

    // The NIN landed on the SAME row, in place — not on a second one.
    const stored = await db.query.respondents.findFirst({
      where: (r, { eq }) => eq(r.id, row!.id),
      columns: { nin: true, status: true },
    });
    expect(stored?.nin).toBe(guardedNin);
    expect(stored?.status).toBe('active');
  });

  it('NEUTERED: remove the promote and the 13-53 defect REAPPEARS — two records, two codes', async () => {
    const rows = await runNeutered(phone());

    // ── THE ASSERTION THIS WHOLE FILE EXISTS FOR ──────────────────────────
    // Two people-shaped records for one person, on one handset.
    expect(rows).toHaveLength(2);

    // And two DIFFERENT reference codes — the citizen-visible identifier, and
    // the thing a merge destroys. This is the harm, not the row count.
    const codes = rows.map((r) => r.referenceCode);
    expect(codes[0]).toBeTruthy();
    expect(codes[1]).toBeTruthy();
    expect(codes[0]).not.toBe(codes[1]);
    expect(new Set(codes).size).toBe(2);
  });

  it('the two cases differ ONLY by the guard — same journey, same shape, opposite outcome', async () => {
    // Review H2 — this test runs BOTH journeys itself, on phones nobody else
    // touches. It used to read the rows the two tests above had written, which
    // made it fail under `--sequence.shuffle.tests` (seed 3: {guarded: 0,
    // neutered: 0}) despite the header claiming shuffle could not break it.
    const guarded = await runGuarded(phone());
    const neutered = await runNeutered(phone());

    // If this ever reads 1 and 1, the negative control has stopped controlling
    // anything and the evidence below it is worthless — fail loudly.
    expect({ guarded: guarded.length, neutered: neutered.length }).toEqual({ guarded: 1, neutered: 2 });
  });
});

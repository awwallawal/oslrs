import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  sweepPhantomDrafts,
  loadPhantomSweepContext,
  filterMarketingCohort,
} from '../campaign-contact.service.js';

/**
 * Story 13-50 AC5 — the pre-blast phantom sweep.
 *
 * The detector is one query, as the story says, so the RULE is what needs pinning. `sweepPhantomDrafts`
 * is pure precisely so this file can exercise it without fixtures — and so a zero can be told
 * apart from a query that returned nothing, which is the failure class the story calls out.
 */

const row = (email: string) => ({ email });
const getEmail = (r: { email: string }) => r.email;

// ── DB fixtures for the loader + wiring suites (unique per run; torn down in afterAll) ──
const STAMP = String(Date.now());
const PHANTOM = `sweep.${STAMP}@gmail.co`;
const REAL = `${PHANTOM}m`; // …@gmail.com — the address that PROVES the phantom
const REGISTERED = `sweep.reg.${STAMP}@gmail.com`;
let seededRespondentId: string | null = null;

beforeAll(async () => {
  for (const email of [PHANTOM, REAL, REGISTERED]) {
    await db.execute(sql`
      INSERT INTO wizard_drafts (id, email, last_updated_at, expires_at)
      VALUES (gen_random_uuid(), ${email}, now(), now() + interval '30 days')
      ON CONFLICT (email) DO NOTHING`);
  }
  // REGISTERED also has a respondent reachable from their submission address.
  const r = (await db.execute(sql`
    INSERT INTO respondents (id, status, source, created_at, updated_at)
    VALUES (gen_random_uuid(), 'active', 'public', now(), now()) RETURNING id`)) as unknown as {
    rows: Array<{ id: string }>;
  };
  seededRespondentId = r.rows[0].id;
  await db.execute(sql`
    INSERT INTO submissions (id, submission_uid, questionnaire_form_id, respondent_id, raw_data,
                             submitted_at, ingested_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${'sweep-' + STAMP}, gen_random_uuid(), ${seededRespondentId},
            ${JSON.stringify({ email: REGISTERED })}::jsonb, now(), now(), now(), now())`);
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM wizard_drafts WHERE email IN (${PHANTOM}, ${REAL}, ${REGISTERED})`);
  if (seededRespondentId) {
    await db.execute(sql`DELETE FROM submissions WHERE respondent_id = ${seededRespondentId}`);
    await db.execute(sql`DELETE FROM respondents WHERE id = ${seededRespondentId}`);
  }
});

describe('13-50 AC5 — phantom sweep over a wizard_drafts cohort', () => {
  /**
   * THE REAL D4 CASE, 2026-08-06. Each of the four has TWO drafts — the `.co` and the `.com` —
   * and the `.co` one is a person who never existed. All four were invited; all four bounced.
   */
  const PHANTOMS = [
    'yusuffasiat@gmail.co',
    'dayoariremako88@gmail.co',
    'ogunbonadamola@gmail.co',
    'aladechristianahtosin@gmail.co',
  ];
  const REALS = PHANTOMS.map((p) => `${p}m`); // …@gmail.com

  it('excludes a draft address that is a strict PREFIX of another draft address', () => {
    const cohort = [...PHANTOMS, ...REALS].map(row);
    const result = sweepPhantomDrafts(cohort, getEmail, {
      allDraftEmails: [...PHANTOMS, ...REALS],
      registeredEmails: [],
    });

    expect(result.phantomPrefixSkipped).toBe(4);
    expect(result.cohort.map(getEmail)).toEqual(REALS);
    expect(result.droppedPhantomEmails.sort()).toEqual([...PHANTOMS].sort());
  });

  /**
   * ⚠️ THE COMPARISON SET IS ALL DRAFTS, NOT THE COHORT. The phantom is the SHORT address; the
   * address that proves it is a phantom is the LONG one, which is typically NOT in an
   * abandoned-draft cohort — its owner finished typing. Restricting the comparison to the cohort
   * makes the detector find nothing and report success.
   */
  it('finds a phantom whose real address is NOT in the cohort', () => {
    const result = sweepPhantomDrafts([row('yusuffasiat@gmail.co')], getEmail, {
      allDraftEmails: ['yusuffasiat@gmail.co', 'yusuffasiat@gmail.com'],
      registeredEmails: [],
    });
    expect(result.phantomPrefixSkipped).toBe(1);
    expect(result.cohort).toHaveLength(0);
  });

  it('AC5.3 — excludes drafts whose owner is already registered', () => {
    const result = sweepPhantomDrafts(
      [row('already@gmail.com'), row('new@gmail.com')],
      getEmail,
      { allDraftEmails: ['already@gmail.com', 'new@gmail.com'], registeredEmails: ['already@gmail.com'] },
    );
    expect(result.alreadyRegisteredSkipped).toBe(1);
    expect(result.cohort.map(getEmail)).toEqual(['new@gmail.com']);
    expect(result.droppedRegisteredEmails).toEqual(['already@gmail.com']);
  });

  it('the two exclusions are counted SEPARATELY — a phantom is not a duplicate', () => {
    const result = sweepPhantomDrafts(
      [row('a@gmail.co'), row('reg@gmail.com'), row('fine@gmail.com')],
      getEmail,
      {
        allDraftEmails: ['a@gmail.co', 'a@gmail.com', 'reg@gmail.com', 'fine@gmail.com'],
        registeredEmails: ['reg@gmail.com'],
      },
    );
    expect(result.phantomPrefixSkipped).toBe(1);
    expect(result.alreadyRegisteredSkipped).toBe(1);
    expect(result.cohort.map(getEmail)).toEqual(['fine@gmail.com']);
  });

  it('an identical address is NOT its own prefix (strict prefix only)', () => {
    const result = sweepPhantomDrafts([row('same@gmail.com')], getEmail, {
      allDraftEmails: ['same@gmail.com', 'same@gmail.com'],
      registeredEmails: [],
    });
    expect(result.phantomPrefixSkipped).toBe(0);
    expect(result.cohort).toHaveLength(1);
  });

  it('is case-insensitive on both sides (canonical comparison)', () => {
    const result = sweepPhantomDrafts([row('Yusuf@Gmail.CO')], getEmail, {
      allDraftEmails: ['yusuf@gmail.co', 'YUSUF@GMAIL.COM'],
      registeredEmails: [],
    });
    expect(result.phantomPrefixSkipped).toBe(1);
  });

  it('an empty cohort is not a pass — it reports zeros, and zeros only', () => {
    const result = sweepPhantomDrafts([], getEmail, { allDraftEmails: [], registeredEmails: [] });
    expect(result).toMatchObject({
      phantomPrefixSkipped: 0,
      alreadyRegisteredSkipped: 0,
      droppedPhantomEmails: [],
      droppedRegisteredEmails: [],
    });
  });

  it('leaves an ordinary cohort untouched — the sweep is not a blanket block', () => {
    const cohort = [row('a@gmail.com'), row('b@yahoo.com')];
    const result = sweepPhantomDrafts(cohort, getEmail, {
      allDraftEmails: ['a@gmail.com', 'b@yahoo.com'],
      registeredEmails: [],
    });
    expect(result.cohort).toHaveLength(2);
  });
});

/**
 * ⚠️ THE LOADER NEEDS ITS OWN COVER — the rule above had cover and the QUERY had none.
 *
 * The first version of `loadPhantomSweepContext` used `= ANY(${canonical})`, which drizzle binds
 * as a single parameter, so Postgres raised `malformed array literal` on the first real execution.
 * Every test above stayed green: they exercise the pure rule and never touch the database. It was
 * caught by `blast-cohort-dedupe.integration.test.ts`, which is about something else entirely —
 * i.e. by luck. Unfixed, it would have thrown on every draft-derived blast, meaning the next
 * jingle-week send.
 *
 * These run against the real test DB and assert the thing the unit tests structurally cannot: that
 * the SQL executes with a multi-element list. They deliberately need no fixtures — a query that
 * cannot run does not care what rows exist.
 */
describe('13-50 AC5 — loadPhantomSweepContext actually executes', () => {
  it('runs with a MULTI-element email list (the `= ANY` bug needed more than one)', async () => {
    const ctx = await loadPhantomSweepContext([
      'one@sweep.test',
      'two@sweep.test',
      'three@sweep.test',
    ]);
    expect(Array.isArray(ctx.allDraftEmails)).toBe(true);
    expect(Array.isArray(ctx.registeredEmails)).toBe(true);
  });

  it('runs with a single-element list', async () => {
    const ctx = await loadPhantomSweepContext(['solo@sweep.test']);
    expect(ctx.registeredEmails).toEqual([]);
  });

  /**
   * An empty list must SHORT-CIRCUIT, not emit `IN ()` — which is a syntax error, not an empty
   * result. This is the branch that turns "nobody to check" into a crash.
   */
  it('short-circuits an empty list instead of emitting IN ()', async () => {
    const ctx = await loadPhantomSweepContext([]);
    expect(ctx).toEqual({ allDraftEmails: [], registeredEmails: [] });
  });

  /**
   * ⚠️ REWRITTEN BY CODE REVIEW 2026-08-24 (M2). The original asserted that an address never
   * inserted was absent from the result — true whether the loader reads ALL drafts or only the
   * candidates, so it could not fail. Proven: narrowing the draft query to
   * `WHERE lower(email) IN (candidates)` — the exact regression the doc-comment above warns
   * about — left all 12 tests green.
   *
   * This version seeds the PROVING address and deliberately leaves it OUT of the candidate list.
   * Only a loader that reads every draft can return it.
   */
  it('loads ALL draft addresses, not just the ones asked about', async () => {
    const ctx = await loadPhantomSweepContext([PHANTOM]);
    expect(ctx.allDraftEmails).toContain(REAL); // REAL was never asked about
    expect(ctx.allDraftEmails).toContain(PHANTOM);
  });
});

/**
 * ── CODE REVIEW 2026-08-24 (C2) — THE WIRING, NOT JUST THE RULE ──────────────────────────────
 *
 * The rule had cover, the loader had cover, and the BRANCH THAT CALLS THEM had none.
 * `draftCohortSweep` appeared in three scripts and one `if` and in **zero tests**: neutering
 * `if (options.draftCohortSweep)` left 29/29 green across this file and 13-46's own
 * `campaign-contact.service.test.ts`. A filter written and never applied is the defect class this
 * story was written to close, applied to the story's own fix.
 *
 * These drive the real `filterMarketingCohort` against real Postgres, with the flag ON and OFF,
 * so the opt-in itself is load-bearing.
 */
describe('13-50 AC5 — filterMarketingCohort wiring (opt-in must actually fire)', () => {
  it('with draftCohortSweep: the phantom is excluded and COUNTED', async () => {
    const result = await filterMarketingCohort(
      [row(PHANTOM), row(REAL)],
      getEmail,
      { draftCohortSweep: true },
    );
    expect(result.phantomPrefixSkipped).toBe(1);
    expect(result.droppedPhantomEmails).toEqual([PHANTOM]);
    expect(result.cohort.map(getEmail)).toEqual([REAL]);
  });

  it('WITHOUT the flag the sweep does not run — the opt-in is the whole control', async () => {
    const result = await filterMarketingCohort([row(PHANTOM), row(REAL)], getEmail);
    expect(result.phantomPrefixSkipped).toBe(0);
    expect(result.cohort.map(getEmail)).toEqual([PHANTOM, REAL]);
  });

  it('excludes an already-registered address only when the flag is set', async () => {
    const on = await filterMarketingCohort([row(REGISTERED)], getEmail, { draftCohortSweep: true });
    expect(on.alreadyRegisteredSkipped).toBe(1);
    expect(on.cohort).toHaveLength(0);

    const off = await filterMarketingCohort([row(REGISTERED)], getEmail);
    expect(off.alreadyRegisteredSkipped).toBe(0);
    expect(off.cohort).toHaveLength(1);
  });
});

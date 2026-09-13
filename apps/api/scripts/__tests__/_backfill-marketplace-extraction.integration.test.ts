/**
 * Story 13-2 R-A2 half (b) — THE PREDICATE, AGAINST A REAL DATABASE.
 *
 * ⭐ WHY THIS EXISTS ALONGSIDE THE UNIT TESTS. The sibling unit file asserts the
 * emitted SQL TEXT, which proves the widening was written. It cannot prove the
 * widening SELECTS THE RIGHT PEOPLE: a wrong JSONB path, a mis-parenthesised OR
 * that makes the whole WHERE permissive, or a comparison against a status that
 * never matches would all satisfy a `toContain` and still publish the wrong cohort.
 *
 * This script is the ONLY path by which an imported respondent gets a public
 * marketplace card, and running it against production publishes up to 8,278 people
 * with no staging step (13-2 R-A3). The predicate deserves a test that executes.
 *
 * Requires a real test DB (NODE_ENV=test + DATABASE_URL=...app_test); the db-guard
 * refuses anything else. Seeds are namespaced by a run-unique prefix and removed in
 * afterAll, so this is safe to re-run and to run beside other suites.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { fetchCandidates, fetchImportedCohortDiagnostics } from '../_backfill-marketplace-extraction.js';

/** Unique per run so a crashed run never poisons the next one. */
const TAG = `ra2-${Date.now()}`;

interface Seed {
  key: string;
  source: string;
  status: string;
  consent: boolean;
  vouch: string | null;
  withSubmission: boolean;
  withProfile: boolean;
  shouldBeSelected: boolean;
  why: string;
}

const SEEDS: Seed[] = [
  {
    key: 'public-consenting', source: 'public', status: 'active', consent: true, vouch: null,
    withSubmission: true, withProfile: false, shouldBeSelected: true,
    why: 'the original 13-27 cohort — must not be displaced by the widening',
  },
  {
    key: 'imported-vouched', source: 'imported_association', status: 'imported_unverified', consent: true,
    vouch: 'AFAN', withSubmission: true, withProfile: false, shouldBeSelected: true,
    why: 'THE 8,278 — the whole point of half (b)',
  },
  {
    key: 'imported-no-vouch', source: 'imported_association', status: 'imported_unverified', consent: true,
    vouch: null, withSubmission: true, withProfile: false, shouldBeSelected: true,
    why: 'no vouch means no BADGE, never no card (13-58; re-affirmed 2026-09-13)',
  },
  {
    key: 'imported-blank-vouch', source: 'imported_association', status: 'imported_unverified', consent: true,
    vouch: '   ', withSubmission: true, withProfile: false, shouldBeSelected: true,
    why: 'a whitespace-only name is no vouch — still a card, rendered badge-less',
  },
  {
    key: 'imported-rolled-back', source: 'imported_association', status: 'rolled_back', consent: true,
    vouch: 'AFAN', withSubmission: true, withProfile: false, shouldBeSelected: false,
    why: 'a retracted batch is soft-deleted; selecting it would inflate the operator count',
  },
  {
    key: 'imported-no-consent', source: 'imported_association', status: 'imported_unverified', consent: false,
    vouch: 'AFAN', withSubmission: true, withProfile: false, shouldBeSelected: false,
    why: 'consent_marketplace is load-bearing and the widening must not weaken it',
  },
  {
    key: 'imported-has-profile', source: 'imported_association', status: 'imported_unverified', consent: true,
    vouch: 'AFAN', withSubmission: true, withProfile: true, shouldBeSelected: false,
    why: 'idempotency — a re-run must not re-enqueue people who already have a card',
  },
  {
    key: 'imported-no-submission', source: 'imported_association', status: 'imported_unverified', consent: true,
    vouch: 'AFAN', withSubmission: false, withProfile: false, shouldBeSelected: false,
    why: 'no rawData means nothing to derive a profile from — left, not fabricated',
  },
  {
    key: 'enumerator-consenting', source: 'enumerator', status: 'active', consent: true, vouch: null,
    withSubmission: true, withProfile: false, shouldBeSelected: false,
    why: 'field rows queue via the live worker path; the allow-list must not sweep them in',
  },
];

const idFor = (key: string): string => `${TAG}-${key}`;

beforeAll(async () => {
  for (const s of SEEDS) {
    const rid = idFor(s.key);
    const metadata = s.vouch === null ? null : JSON.stringify({ association_name: s.vouch });
    await db.execute(sql`
      INSERT INTO respondents (id, first_name, source, status, consent_marketplace, metadata, created_at, updated_at)
      VALUES (gen_random_uuid(), ${rid}, ${s.source}, ${s.status}, ${s.consent}, ${metadata}::jsonb, now(), now())
    `);
    if (s.withSubmission) {
      await db.execute(sql`
        INSERT INTO submissions (id, respondent_id, submission_uid, questionnaire_form_id,
                                 raw_data, submitted_at, ingested_at, created_at, updated_at)
        SELECT gen_random_uuid(), r.id, ${`${rid}-sub`}, 'import:test',
               ${JSON.stringify({ skills_possessed: ['farming'] })}::jsonb, now(), now(), now(), now()
        FROM respondents r WHERE r.first_name = ${rid}
      `);
    }
    if (s.withProfile) {
      await db.execute(sql`
        INSERT INTO marketplace_profiles (id, respondent_id, created_at, updated_at)
        SELECT gen_random_uuid(), r.id, now(), now()
        FROM respondents r WHERE r.first_name = ${rid}
      `);
    }
  }
});

afterAll(async () => {
  const like = `${TAG}-%`;
  await db.execute(sql`
    DELETE FROM marketplace_profiles WHERE respondent_id IN
      (SELECT id FROM respondents WHERE first_name LIKE ${like})
  `);
  await db.execute(sql`
    DELETE FROM submissions WHERE respondent_id IN
      (SELECT id FROM respondents WHERE first_name LIKE ${like})
  `);
  await db.execute(sql`DELETE FROM respondents WHERE first_name LIKE ${like}`);
});

describe('fetchCandidates against a real database (13-2 R-A2 half b)', () => {
  it.each(SEEDS)('$key -> selected=$shouldBeSelected ($why)', async (seed) => {
    const candidates = await fetchCandidates(null);
    const mine = candidates.filter((c) => c.firstName === idFor(seed.key));
    expect(mine.length).toBe(seed.shouldBeSelected ? 1 : 0);
  });

  /**
   * ⛔ THE GUARD AGAINST A PERMISSIVE REWRITE. Asserting each row individually
   * would still pass if the WHERE clause selected EVERYONE, because both
   * should-be-selected rows would be found either way. This pins the exact set.
   */
  it('selects exactly the four eligible seeds and nobody else from this run', async () => {
    const candidates = await fetchCandidates(null);
    const mine = candidates
      .filter((c) => c.firstName?.startsWith(`${TAG}-`))
      .map((c) => c.firstName)
      .sort();

    expect(mine).toEqual(
      [
        idFor('imported-blank-vouch'),
        idFor('imported-no-vouch'),
        idFor('imported-vouched'),
        idFor('public-consenting'),
      ].sort(),
    );
  });

  it('carries the source through so the dry-run can break its count down by cohort', async () => {
    const candidates = await fetchCandidates(null);
    const imported = candidates.find((c) => c.firstName === idFor('imported-vouched'));
    expect(imported?.source).toBe('imported_association');
  });
});

/**
 * 13-2 R-A2 review P4 — THE STAGED PUBLISH, SCOPED BY BATCH.
 *
 * Before `--batch-id`, staging relied on `--max-rows N` taking the first N by `r.id`,
 * which happened to be the 56 ASNAT tilers only because they were imported first. A
 * scope that holds by insertion order breaks the moment one new person opts in. These
 * assert that a batch scope selects that batch's people and NOBODY else — not the
 * other batch, and not the public cohort, which belongs to no batch.
 */
describe('fetchCandidates / diagnostics scoped by --batch-id (P4)', () => {
  const P4 = `${TAG}-p4`;
  const scoped: Record<string, string> = {};

  beforeAll(async () => {
    const [u] = (await db.execute(sql`
      INSERT INTO users (id, email, full_name, role_id, status, auth_provider, created_at, updated_at)
      SELECT gen_random_uuid(), ${`${P4}@test.local`}, ${`${P4} uploader`}, r.id, 'active', 'local', now(), now()
      FROM roles r LIMIT 1
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;
    scoped.uploader = u.id;

    for (const name of ['a', 'b']) {
      const [b] = (await db.execute(sql`
        INSERT INTO import_batches (id, source, original_filename, file_hash, file_size_bytes,
                                    parser_used, lawful_basis, uploaded_by)
        VALUES (gen_random_uuid(), 'imported_association', ${`${P4}-${name}.csv`}, ${`${P4}-${name}`}, 1,
                'csv', 'public_interest', ${scoped.uploader}::uuid)
        RETURNING id
      `) as { rows: Array<{ id: string }> }).rows;
      scoped[`batch-${name}`] = b.id;

      // Two people in batch A (one without a vouch — still a candidate), one in B.
      for (const who of name === 'a' ? ['a1', 'a2-novouch'] : ['b1']) {
        const meta = who.includes('novouch') ? null : JSON.stringify({ association_name: 'AFAN' });
        const [r] = (await db.execute(sql`
          INSERT INTO respondents (id, first_name, source, status, consent_marketplace, import_batch_id,
                                   metadata, created_at, updated_at)
          VALUES (gen_random_uuid(), ${`${P4}-${who}`}, 'imported_association', 'imported_unverified', true,
                  ${b.id}::uuid, ${meta}::jsonb, now(), now())
          RETURNING id
        `) as { rows: Array<{ id: string }> }).rows;
        await db.execute(sql`
          INSERT INTO submissions (id, respondent_id, submission_uid, questionnaire_form_id,
                                   raw_data, submitted_at, ingested_at, created_at, updated_at)
          VALUES (gen_random_uuid(), ${r.id}::uuid, ${`${P4}-${who}-sub`}, 'import:imported_association',
                  ${JSON.stringify({ skills_possessed: ['farming'] })}::jsonb, now(), now(), now(), now())
        `);
      }
    }
  });

  afterAll(async () => {
    const like = `${P4}-%`;
    await db.execute(sql`
      DELETE FROM submissions WHERE respondent_id IN (SELECT id FROM respondents WHERE first_name LIKE ${like})
    `);
    await db.execute(sql`DELETE FROM respondents WHERE first_name LIKE ${like}`);
    await db.execute(sql`DELETE FROM import_batches WHERE file_hash LIKE ${like}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${scoped.uploader}::uuid`);
  });

  it('selects exactly that batch — not the other batch, not the public cohort', async () => {
    const candidates = await fetchCandidates(null, scoped['batch-a']);
    expect(candidates.map((c) => c.firstName).sort()).toEqual([`${P4}-a1`, `${P4}-a2-novouch`]);
    // Nothing outside the batch leaks in — including this file's own public seed.
    expect(candidates.every((c) => c.source === 'imported_association')).toBe(true);
  });

  it('scopes the diagnostics to the same batch, so the prediction matches the run', async () => {
    const diag = await fetchImportedCohortDiagnostics(scoped['batch-b']);
    expect(diag).toEqual({ consented: 1, noSubmission: 0, alreadyHasProfile: 0, noVouch: 0, rolledBack: 0 });
  });
});

describe('fetchImportedCohortDiagnostics against a real database', () => {
  /**
   * These are the numbers an operator predicts against before a public publish, so
   * a wrong one is worse than none. Asserted as lower bounds over the seeded rows
   * rather than absolutes, because the test DB is shared with other suites.
   */
  it('counts the seeded imported_association rows by exclusion reason', async () => {
    const diag = await fetchImportedCohortDiagnostics();

    expect(diag.consented).toBeGreaterThanOrEqual(6);
    expect(diag.noVouch).toBeGreaterThanOrEqual(2);
    expect(diag.rolledBack).toBeGreaterThanOrEqual(1);
    expect(diag.alreadyHasProfile).toBeGreaterThanOrEqual(1);
    expect(diag.noSubmission).toBeGreaterThanOrEqual(1);
  });
});

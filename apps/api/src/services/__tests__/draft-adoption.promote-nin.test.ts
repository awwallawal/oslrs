import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 13-49 AC14 — the free NIN promotions.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE CODE REVIEW FOUND AC14 SHIPPED IN NOTHING (2026-08-02):
 * no module, no task, no test, no Residual, while the story's Closing verdict read "Every code
 * AC is implemented and gated". What is pinned down here is the part that makes AC14 safe
 * rather than merely useful — that a NIN which is not 11 digits goes to a HUMAN, and that an
 * existing NIN is never overwritten from a months-old draft.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    clash: null as Record<string, unknown> | null,
    updates: [] as Record<string, unknown>[],
    wheres: 0,
    returning: [] as { id: string }[],
    audits: [] as Record<string, unknown>[],
  },
}));

vi.mock('../../db/index.js', () => ({
  db: {
    query: { respondents: { findFirst: async () => mocks.clash } },
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            mocks.updates.push(v);
            mocks.wheres++;
            return mocks.returning;
          },
        }),
      }),
    }),
  },
}));

vi.mock('../audit.service.js', () => ({
  AuditService: { logAction: (p: Record<string, unknown>) => mocks.audits.push(p) },
  AUDIT_ACTIONS: { PENDING_NIN_PROMOTED: 'pending_nin.promoted' },
  AUDIT_TARGETS: { RESPONDENT: 'respondent' },
}));

const { classifyNinPromotion, pairDraftsToPendingRespondents, promoteRespondentNin } =
  await import('../draft-adoption/promote-nin.js');

const candidate = (over: Record<string, unknown> = {}) => ({
  respondentId: 'resp-1',
  referenceCode: 'OSL-2026-GHKMYR',
  respondentNin: null as string | null,
  draftNin: '27287257118',
  draftId: 'draft-1',
  ...over,
});

beforeEach(() => {
  mocks.clash = null;
  mocks.updates.length = 0;
  mocks.audits.length = 0;
  mocks.wheres = 0;
  mocks.returning = [{ id: 'resp-1' }];
});

describe('13-49 AC14 — classifyNinPromotion', () => {
  it('promotes a well-formed 11-digit NIN the respondent does not have', () => {
    const d = classifyNinPromotion(candidate());
    expect(d.verdict).toBe('promote');
    expect(d.nin).toBe('27287257118');
  });

  /**
   * THE OSL-2026-RRCHDX ROW. AC14 names it explicitly: `1589857782` is ten digits, most
   * plausibly a dropped leading zero. It must be neither padded nor dropped — both are a script
   * guessing a national identity number on a citizen's behalf.
   */
  it('routes a 10-digit NIN to MANUAL REVIEW — never pads, never drops', () => {
    const d = classifyNinPromotion(candidate({ draftNin: '1589857782' }));
    expect(d.verdict).toBe('manual_review_bad_shape');
    expect(d.nin).toBeUndefined();
    expect(d.reason).toMatch(/leading zero/i);
  });

  it('does not silently accept a padded value either', () => {
    // 12 digits is just as wrong as 10 and must not slip through a `length >= 11` style check.
    expect(classifyNinPromotion(candidate({ draftNin: '012345678901' })).verdict).toBe(
      'manual_review_bad_shape',
    );
  });

  it('rejects a non-numeric NIN', () => {
    expect(classifyNinPromotion(candidate({ draftNin: '2728725711A' })).verdict).toBe(
      'manual_review_bad_shape',
    );
  });

  it('NEVER overwrites a NIN the respondent already holds', () => {
    const d = classifyNinPromotion(candidate({ respondentNin: '99999999999' }));
    expect(d.verdict).toBe('respondent_already_has_nin');
  });

  it('reports "no NIN in the draft" rather than treating blank as a promotion', () => {
    expect(classifyNinPromotion(candidate({ draftNin: '' })).verdict).toBe('no_nin_in_draft');
    expect(classifyNinPromotion(candidate({ draftNin: '   ' })).verdict).toBe('no_nin_in_draft');
  });
});

/**
 * ⚠️ THE TABLE FROM THE STORY ITSELF, not fixtures I chose.
 *
 * AC14's Dev Notes list all 10 candidates by reference code and NIN, measured on prod
 * 2026-08-02, and assert the outcome: "**9 promote cleanly; the 10th must NOT be silently
 * padded or dropped**". This drives the classifier with those exact values so the claim in the
 * story and the behaviour of the code are checked against each other in CI — rather than in an
 * operator's terminal on the live run. If the numbers ever diverge, one of the two is wrong and
 * this is what says so.
 *
 * (These are real NINs, and they are already committed in the story file — no new exposure.)
 */
describe('13-49 AC14 — the documented 10, end to end', () => {
  const TABLE: Array<[ref: string, nin: string]> = [
    ['OSL-2026-GHKMYR', '27287257118'],
    ['OSL-2026-800KD8', '31468486435'],
    ['OSL-2026-MVGRC2', '55581526029'],
    ['OSL-2026-XFZMDP', '48801656320'],
    ['OSL-2026-KKGH4S', '41279312287'],
    ['OSL-2026-C066C2', '69974412841'],
    ['OSL-2026-RX145M', '75307723007'],
    ['OSL-2026-SSGTX5', '81408916224'],
    ['OSL-2026-DZVTS4', '37577870502'],
    ['OSL-2026-RRCHDX', '1589857782'], // ⚠️ 10 digits — the dropped-leading-zero row
  ];

  const verdicts = TABLE.map(([ref, nin]) => ({
    ref,
    verdict: classifyNinPromotion({
      respondentId: ref, referenceCode: ref, respondentNin: null, draftNin: nin, draftId: 'd',
    }).verdict,
  }));

  it('promotes exactly 9 and sends exactly 1 to manual review', () => {
    expect(verdicts.filter((v) => v.verdict === 'promote')).toHaveLength(9);
    expect(verdicts.filter((v) => v.verdict === 'manual_review_bad_shape')).toHaveLength(1);
  });

  it('and the one held back is OSL-2026-RRCHDX, by name', () => {
    // Named explicitly: "the 10th" is only meaningful while the table keeps its order.
    expect(verdicts.find((v) => v.verdict === 'manual_review_bad_shape')?.ref).toBe(
      'OSL-2026-RRCHDX',
    );
  });

  it('never emits a NIN it was not given — no padding anywhere in the set', () => {
    for (const [ref, nin] of TABLE) {
      const d = classifyNinPromotion({
        respondentId: ref, referenceCode: ref, respondentNin: null, draftNin: nin, draftId: 'd',
      });
      if (d.nin !== undefined) expect(d.nin).toBe(nin);
    }
  });

  it('AC14 arithmetic holds: the 35 residue becomes 26 pending the manual row', () => {
    // The story states 35 → 25 on the assumption all 10 clear. Only 9 do without a human,
    // so the honest post-run figure is 26 until OSL-2026-RRCHDX is confirmed.
    const promoted = verdicts.filter((v) => v.verdict === 'promote').length;
    expect(35 - promoted).toBe(26);
  });
});

describe('13-49 AC14 — pairDraftsToPendingRespondents', () => {
  const drafts = [
    {
      id: 'draft-1',
      email: 'Sadiq@Example.com',
      formData: { questionnaireResponses: { nin: '27287257118' } },
    },
  ];

  it('pairs by email, case-insensitively', () => {
    const out = pairDraftsToPendingRespondents(
      [{ id: 'r1', referenceCode: 'OSL-1', nin: null, email: 'sadiq@example.com' }],
      drafts,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.draftNin).toBe('27287257118');
    expect(out[0]!.draftId).toBe('draft-1');
  });

  it('drops a respondent with no resolvable email rather than guessing a pairing', () => {
    // `respondents` has no email column; a null here means all four contact sources missed.
    expect(
      pairDraftsToPendingRespondents([{ id: 'r1', referenceCode: null, nin: null, email: null }], drafts),
    ).toHaveLength(0);
  });

  it('takes the NIN from the questionnaire, which is where these drafts keep it', () => {
    const out = pairDraftsToPendingRespondents(
      [{ id: 'r1', referenceCode: null, nin: null, email: 'sadiq@example.com' }],
      [
        {
          id: 'draft-2',
          email: 'sadiq@example.com',
          // fd.nin is the truncated 10-digit value the review measured on 13 of 14 divergences.
          formData: { nin: '1589857782', questionnaireResponses: { nin: '27287257118' } },
        },
      ],
    );
    expect(out[0]!.draftNin).toBe('27287257118');
  });
});

describe('13-49 AC14 — promoteRespondentNin', () => {
  const run = () =>
    promoteRespondentNin({
      respondentId: 'resp-1',
      draftId: 'draft-1',
      nin: '27287257118',
      promotedAt: new Date('2026-08-02T09:00:00.000Z'),
    });

  it('sets the NIN, advances the status and writes the audit row', async () => {
    const result = await run();
    expect(result.promoted).toBe(true);
    expect(mocks.updates[0]!.nin).toBe('27287257118');
    expect(mocks.updates[0]!.status).toBe('active');
    expect(mocks.audits).toHaveLength(1);
    expect(mocks.audits[0]!.action).toBe('pending_nin.promoted');
    expect((mocks.audits[0]!.details as Record<string, unknown>).trigger).toBe(
      'draft_adoption_ac14',
    );
  });

  it('refuses when another respondent already holds that NIN (FR21)', async () => {
    mocks.clash = { id: 'other', referenceCode: 'OSL-2026-OTHER' };
    const result = await run();
    expect(result.promoted).toBe(false);
    expect(result.reason).toMatch(/already held/i);
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.audits).toHaveLength(0);
  });

  /**
   * The TOCTOU guard. The 9-12 ladder promotes rows on its own schedule, so between our read
   * and our write the row may no longer be the row we decided about. The UPDATE re-asserts
   * `status = 'nin_unavailable' AND nin IS NULL` and a zero-row result is reported, not assumed
   * to be success.
   */
  it('reports rather than assumes success when the row was promoted by something else first', async () => {
    mocks.returning = [];
    const result = await run();
    expect(result.promoted).toBe(false);
    expect(result.reason).toMatch(/no longer/i);
    expect(mocks.audits).toHaveLength(0);
  });
});

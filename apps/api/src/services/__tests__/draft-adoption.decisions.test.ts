import { describe, it, expect } from 'vitest';
import {
  DRAFT_DECISIONS,
  cohortOf,
  isDraftDecision,
  recommendDecision,
  NIN_PATTERN,
  type DecisionInput,
} from '../draft-adoption/decisions.js';

/**
 * Story 13-49 Task 1 — the decision vocabulary is shared by the workbook WRITER
 * (`scripts/build-draft-triage-workbook.ts`) and the adopt-script READER. Two copies
 * would drift, and drift here silently mis-routes a citizen between cohorts — so the
 * vocabulary is tested once, here, and imported by both.
 */

/** A row that qualifies for every D1 gate; individual tests knock out one field at a time. */
const complete: DecisionInput = {
  firstName: 'Adebayo',
  surname: 'Ogunlade',
  nin: '12345678901',
  lgaId: 'ibadan-north',
  phone: '+2348012345678',
  consentBasic: 'yes',
  answerCount: 12,
  alreadyRegistered: false,
  isOneOf63: false,
};

describe('13-49 decisions — vocabulary', () => {
  it('carries all seven dispositions, one per cohort branch', () => {
    expect([...DRAFT_DECISIONS]).toEqual([
      'PUSH_TO_REGISTRY',
      'PUSH_PENDING_NIN',
      'BACKFILL_THE_63',
      'INVITE_TO_RESUME',
      'EXCLUDE_EMPTY',
      'EXCLUDE_CONSENT_NO',
      'ALREADY_REGISTERED',
    ]);
  });

  it('isDraftDecision accepts the vocabulary and rejects everything else', () => {
    for (const d of DRAFT_DECISIONS) expect(isDraftDecision(d)).toBe(true);
    // The reader fails CLOSED on all of these (Task 2) — blank, typo, lowercase, stale value.
    for (const bad of ['', '   ', 'push_to_registry', 'PUSH', 'PUSH_TO_REGISTRY ', 'DELETE'])
      expect(isDraftDecision(bad)).toBe(false);
  });

  it('maps every decision to exactly one cohort', () => {
    expect(cohortOf('PUSH_TO_REGISTRY')).toBe('D1');
    expect(cohortOf('BACKFILL_THE_63')).toBe('D2');
    expect(cohortOf('PUSH_PENDING_NIN')).toBe('D3');
    expect(cohortOf('INVITE_TO_RESUME')).toBe('D4');
    expect(cohortOf('EXCLUDE_EMPTY')).toBe('D4'); // 67 nameless + 7 thin = D4's 74
    expect(cohortOf('EXCLUDE_CONSENT_NO')).toBe('D5');
    expect(cohortOf('ALREADY_REGISTERED')).toBe('D6');
  });
});

describe('13-49 decisions — recommendDecision (rules)', () => {
  it('D1: complete + consented + new → PUSH_TO_REGISTRY', () => {
    expect(recommendDecision(complete)).toBe('PUSH_TO_REGISTRY');
  });

  /**
   * THE TASK-1 GAP. Before this rule existed these 20 rows fell through to
   * INVITE_TO_RESUME, which conflated D3 with D4's 7 thin rows — and AC2 forbids the
   * script inferring a disposition the operator never picked.
   */
  it('D3: name + phone + LGA + consent, NO NIN → PUSH_PENDING_NIN (not INVITE_TO_RESUME)', () => {
    expect(recommendDecision({ ...complete, nin: '' })).toBe('PUSH_PENDING_NIN');
  });

  it('D3 requires the full identity set — a missing surname/phone/LGA falls back to INVITE_TO_RESUME', () => {
    expect(recommendDecision({ ...complete, nin: '', surname: '' })).toBe('INVITE_TO_RESUME');
    expect(recommendDecision({ ...complete, nin: '', phone: '' })).toBe('INVITE_TO_RESUME');
    expect(recommendDecision({ ...complete, nin: '', lgaId: '' })).toBe('INVITE_TO_RESUME');
  });

  it('D3 is consent-gated exactly like D1 — blank consent is never actionable', () => {
    expect(recommendDecision({ ...complete, nin: '', consentBasic: '' })).toBe('INVITE_TO_RESUME');
  });

  it('D2: a match against one of the 63 outranks everything except nothing — enrich, never re-create', () => {
    expect(recommendDecision({ ...complete, isOneOf63: true })).toBe('BACKFILL_THE_63');
    // Even a bare row is worth enriching: the record already exists.
    expect(
      recommendDecision({ ...complete, isOneOf63: true, firstName: '', surname: '', nin: '', answerCount: 1 }),
    ).toBe('BACKFILL_THE_63');
  });

  it('D6: already a full respondent → ALREADY_REGISTERED, so a push cannot duplicate them', () => {
    expect(recommendDecision({ ...complete, alreadyRegistered: true })).toBe('ALREADY_REGISTERED');
  });

  it('D6 outranks D2 only when the person is NOT one of the 63', () => {
    // Both flags set = a respondent WITH a submission that also matches the bare cohort;
    // the 63 branch wins, because enriching a real record is never wrong and duplicating is.
    expect(recommendDecision({ ...complete, alreadyRegistered: true, isOneOf63: true })).toBe(
      'BACKFILL_THE_63',
    );
  });

  it('D5: consent_basic = no wins over a complete, registerable row', () => {
    expect(recommendDecision({ ...complete, consentBasic: 'no' })).toBe('EXCLUDE_CONSENT_NO');
  });

  it('D5 consent matching is case- and whitespace-insensitive (sheet + DB both hand us raw text)', () => {
    expect(recommendDecision({ ...complete, consentBasic: ' No ' })).toBe('EXCLUDE_CONSENT_NO');
    expect(recommendDecision({ ...complete, consentBasic: 'YES' })).toBe('PUSH_TO_REGISTRY');
  });

  it('D4: no answers and no identity → EXCLUDE_EMPTY (the 67 nameless)', () => {
    expect(
      recommendDecision({
        ...complete,
        firstName: '',
        surname: '',
        nin: '',
        lgaId: '',
        phone: '',
        consentBasic: '',
        answerCount: 0,
      }),
    ).toBe('EXCLUDE_EMPTY');
  });

  it('D4: partial answers but not registerable → INVITE_TO_RESUME (the 7 thin)', () => {
    expect(recommendDecision({ ...complete, nin: '', lgaId: '', phone: '', answerCount: 3 })).toBe(
      'INVITE_TO_RESUME',
    );
  });

  it('a consent = no row is excluded even when it is otherwise empty (consent outranks emptiness)', () => {
    expect(
      recommendDecision({
        ...complete,
        firstName: '',
        surname: '',
        nin: '',
        answerCount: 1,
        consentBasic: 'no',
      }),
    ).toBe('EXCLUDE_CONSENT_NO');
  });

  /**
   * ⚠️ ADDED 2026-08-02 (code-review follow-up) — R8, fixed as a CLASS rather than 2 rows.
   *
   * `has(nin)` was true for a 4-character value, so the workbook RECOMMENDED PUSH_TO_REGISTRY
   * and the adopt pre-flight then REFUSED that same row. Every regeneration re-seeded a
   * decision guaranteed to abort the run, and the operator's only clue arrived at apply time.
   * A recommendation that cannot be executed is a bug in the recommender.
   *
   * Routing to D3 (rather than to an invitation) is the deliberate choice: these people are
   * complete apart from one broken field, so they are registered today and the 9-12 ladder —
   * measured at 69% conversion, and whose entire job is "we have you, we need your NIN" — asks
   * for exactly that field. Sending them back to re-register discards 10+ answers and lands
   * them on an empty form (R2: identity does not prefill on resume).
   */
  describe('a malformed NIN counts as ABSENT, not as present', () => {
    it.each(['7474', '291992', '1589857782', '012345678901', '1234567890A'])(
      'routes an otherwise-complete draft with NIN %s to PUSH_PENDING_NIN',
      (nin) => {
        expect(recommendDecision({ ...complete, nin })).toBe('PUSH_PENDING_NIN');
      },
    );

    it('still routes a VALID 11-digit NIN to PUSH_TO_REGISTRY', () => {
      expect(recommendDecision({ ...complete, nin: '12345678901' })).toBe('PUSH_TO_REGISTRY');
    });

    it('does NOT rescue a row that fails on something other than the NIN', () => {
      // A broken NIN does not promote a thin row into an adoption — identity/contact/consent
      // still gate it, and the residue is still an invitation.
      expect(recommendDecision({ ...complete, nin: '7474', phone: '' })).toBe('INVITE_TO_RESUME');
      expect(recommendDecision({ ...complete, nin: '7474', consentBasic: '' })).toBe(
        'INVITE_TO_RESUME',
      );
    });

    it('never recommends a decision the payload builder would refuse', () => {
      // The property that actually matters: recommender and enforcer agree by construction.
      for (const nin of ['', '7474', '291992', '12345678901']) {
        const d = recommendDecision({ ...complete, nin });
        expect(d === 'PUSH_TO_REGISTRY' ? NIN_PATTERN.test(nin) : true).toBe(true);
      }
    });
  });
});

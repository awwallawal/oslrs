import { describe, it, expect } from 'vitest';
import {
  ADOPTION_MARKER,
  assertConsentActionable,
  assertNotConsentRefused,
  buildAdoptionRawData,
  DraftRowError,
  NIN_PATTERN,
  resolveDraftIdentity,
  type DraftRow,
} from '../draft-adoption/payload.js';

/**
 * Story 13-49 Tasks 3 + 4 — the consent guard (AC7/R3) and the draft → submission
 * payload builder (AC3/AC4/AC5/AC11).
 *
 * The single most expensive mistake available on this path is reading identity from the
 * WRONG place: `formData.givenName` is populated in 8 of 292 drafts, `questionnaireResponses.
 * firstname` in 208. A builder that prefers the head step produces 200 near-empty registry
 * records that look successful.
 */

const ADOPTED_AT = new Date('2026-08-01T12:00:00.000Z');

/**
 * A draft in the shape the 208 old rows actually take: identity inside the questionnaire.
 * `questionnaireResponses` overrides MERGE onto the base row (so a test can knock out one
 * field); any other override lands on `formData`.
 */
const oldStyleDraft = (
  overrides: { questionnaireResponses?: Record<string, unknown> } & Record<string, unknown> = {},
): DraftRow => {
  const { questionnaireResponses: qOverrides, ...fdOverrides } = overrides;
  return {
    id: 'draft-1',
    email: 'adebayo@example.com',
    formData: {
      ...fdOverrides,
      questionnaireResponses: {
        firstname: 'Adebayo',
        surname: 'Ogunlade',
        nin: '12345678901',
        dob: '1990-04-12',
        lga_id: 'ibadan-north',
        phone_number: '+2348012345678',
        consent_basic: 'yes',
        consent_marketplace: 'yes',
        consent_enriched: 'no',
        main_occupation: 'Tailor',
        skills_possessed: 'sewing, pattern-cutting',
        // Two of the 22 Master-only orphans the Public Core no longer collects.
        household_size: '6',
        business_name: 'Ade Tailoring',
        ...qOverrides,
      },
    },
  };
};

describe('13-49 payload — resolveDraftIdentity', () => {
  it('reads identity from questionnaireResponses (where 208 of 292 drafts keep it)', () => {
    const id = resolveDraftIdentity(oldStyleDraft());
    expect(id.firstName).toBe('Adebayo');
    expect(id.surname).toBe('Ogunlade');
    expect(id.nin).toBe('12345678901');
    expect(id.dob).toBe('1990-04-12');
    expect(id.lgaId).toBe('ibadan-north');
    expect(id.phone).toBe('+2348012345678');
  });

  it('falls back to the head-step fields for a NEW-style draft (the other 8)', () => {
    const draft: DraftRow = {
      id: 'draft-2',
      email: 'ngozi@example.com',
      formData: {
        givenName: 'Ngozi',
        familyName: 'Adeyemi',
        nin: '99999999999',
        dateOfBirth: '1995-01-01',
        lgaId: 'oyo-east',
        phone: '+2348090000000',
        questionnaireResponses: { consent_basic: 'yes' },
      },
    };
    const id = resolveDraftIdentity(draft);
    expect(id.firstName).toBe('Ngozi');
    expect(id.surname).toBe('Adeyemi');
    expect(id.nin).toBe('99999999999');
    expect(id.lgaId).toBe('oyo-east');
    expect(id.phone).toBe('+2348090000000');
  });

  /** The direction of the fallback IS the story's headline warning — assert it explicitly. */
  it('PREFERS the questionnaire when both are present — never the near-empty head step', () => {
    const draft = oldStyleDraft();
    draft.formData.givenName = 'WRONG';
    draft.formData.familyName = 'WRONG';
    const id = resolveDraftIdentity(draft);
    expect(id.firstName).toBe('Adebayo');
    expect(id.surname).toBe('Ogunlade');
  });

  it('treats blank/whitespace questionnaire values as absent and falls through', () => {
    const draft = oldStyleDraft({ questionnaireResponses: { firstname: '   ' } });
    draft.formData.givenName = 'Ngozi';
    expect(resolveDraftIdentity(draft).firstName).toBe('Ngozi');
  });

  it('resolves the legacy fullName head field when nothing else carries a name', () => {
    const draft: DraftRow = {
      id: 'd',
      email: 'e@x.com',
      formData: { fullName: 'Tunde Bakare', questionnaireResponses: {} },
    };
    const id = resolveDraftIdentity(draft);
    expect(id.firstName).toBe('Tunde');
    expect(id.surname).toBe('Bakare');
  });

  it('counts answers, so an empty draft is distinguishable from an unanswered one', () => {
    expect(resolveDraftIdentity(oldStyleDraft()).answerCount).toBeGreaterThan(5);
    expect(
      resolveDraftIdentity({ id: 'd', email: 'e@x.com', formData: {} }).answerCount,
    ).toBe(0);
  });

  it('normalises boolean head-step consents to the yes/no the extractor expects', () => {
    // `extractRespondentData` compares String(value).toLowerCase() === 'yes'; a raw `true`
    // silently becomes 'true' and reads as NO CONSENT. Getting this wrong strips marketplace
    // consent from everyone who set it on the head step.
    const draft: DraftRow = {
      id: 'd',
      email: 'e@x.com',
      formData: { consentMarketplace: true, consentEnriched: false, questionnaireResponses: {} },
    };
    const id = resolveDraftIdentity(draft);
    expect(id.consentMarketplace).toBe('yes');
    expect(id.consentEnriched).toBe('no');
  });
});

describe('13-49 payload — assertConsentActionable (AC7 / R3)', () => {
  it('passes on an explicit yes', () => {
    expect(() => assertConsentActionable(oldStyleDraft())).not.toThrow();
  });

  /**
   * R3's exact test: set a D5 row to PUSH_TO_REGISTRY in the sheet — the script must
   * still refuse. The guard reads the LIVE draft, never the spreadsheet column, because
   * a sheet is editable and a guard is not.
   */
  it('REFUSES consent = no even though the caller already chose to adopt', () => {
    expect(() =>
      assertConsentActionable(oldStyleDraft({ questionnaireResponses: { consent_basic: 'no' } })),
    ).toThrow(DraftRowError);
  });

  it('REFUSES blank consent — only an explicit yes is actionable', () => {
    expect(() =>
      assertConsentActionable(oldStyleDraft({ questionnaireResponses: { consent_basic: '' } })),
    ).toThrow(/consent/i);
  });

  it('REFUSES a missing consent key (absent is not the same as yes)', () => {
    expect(() =>
      assertConsentActionable({ id: 'd', email: 'e@x.com', formData: { questionnaireResponses: {} } }),
    ).toThrow(DraftRowError);
  });

  it('accepts yes case-insensitively and with stray whitespace', () => {
    expect(() =>
      assertConsentActionable(oldStyleDraft({ questionnaireResponses: { consent_basic: ' YES ' } })),
    ).not.toThrow();
  });
});

describe('13-49 payload — buildAdoptionRawData (D1)', () => {
  const build = (draft = oldStyleDraft()) =>
    buildAdoptionRawData({ draft, decision: 'PUSH_TO_REGISTRY', adoptedAt: ADOPTED_AT });

  it('spreads EVERY answer key into rawData, including the Master-only orphans', () => {
    const raw = build();
    // AC3: "spread ALL answer keys into raw_data (including the 22 Master-only orphans —
    // they are data the shorter form no longer collects)."
    expect(raw.main_occupation).toBe('Tailor');
    expect(raw.skills_possessed).toBe('sewing, pattern-cutting');
    expect(raw.household_size).toBe('6');
    expect(raw.business_name).toBe('Ade Tailoring');
  });

  it('emits the identity keys the RESPONDENT_FIELD_MAP already understands', () => {
    const raw = build();
    expect(raw.firstname).toBe('Adebayo');
    expect(raw.surname).toBe('Ogunlade');
    expect(raw.nin).toBe('12345678901');
    expect(raw.dob).toBe('1990-04-12');
    expect(raw.lga_id).toBe('ibadan-north');
    expect(raw.phone_number).toBe('+2348012345678');
  });

  it('back-fills identity onto the canonical keys for a head-step-only draft', () => {
    const raw = buildAdoptionRawData({
      draft: {
        id: 'd',
        email: 'ngozi@example.com',
        formData: {
          givenName: 'Ngozi',
          familyName: 'Adeyemi',
          nin: '99999999999',
          lgaId: 'oyo-east',
          phone: '+2348090000000',
          questionnaireResponses: { consent_basic: 'yes' },
        },
      },
      decision: 'PUSH_TO_REGISTRY',
      adoptedAt: ADOPTED_AT,
    });
    expect(raw.firstname).toBe('Ngozi');
    expect(raw.surname).toBe('Adeyemi');
    expect(raw.nin).toBe('99999999999');
  });

  it('carries the draft email so the registration auto-emails have somewhere to go', () => {
    // `processSubmission` reads rawData.email for the confirmation + thank-you sends;
    // without it the adoption succeeds silently and nobody is ever told their number.
    expect(build().email).toBe('adebayo@example.com');
  });

  it('stamps the AC11 rollback marker into rawData', () => {
    const raw = build();
    expect(raw._adopted_by).toBe(ADOPTION_MARKER);
    expect(raw._adopted_at).toBe(ADOPTED_AT.toISOString());
    expect(raw._adopted_from_draft_id).toBe('draft-1');
  });

  it('REFUSES a D1 adoption with no NIN — that row is a D3, and the operator must say so', () => {
    expect(() =>
      buildAdoptionRawData({
        draft: oldStyleDraft({ questionnaireResponses: { nin: '' } }),
        decision: 'PUSH_TO_REGISTRY',
        adoptedAt: ADOPTED_AT,
      }),
    ).toThrow(/NIN/i);
  });

  it('REFUSES an adoption with no name — there is no person to create', () => {
    expect(() =>
      buildAdoptionRawData({
        draft: oldStyleDraft({ questionnaireResponses: { firstname: '', surname: '' } }),
        decision: 'PUSH_TO_REGISTRY',
        adoptedAt: ADOPTED_AT,
      }),
    ).toThrow(/name/i);
  });

  it('REFUSES an adoption whose live consent is not yes, whatever the sheet said', () => {
    expect(() =>
      buildAdoptionRawData({
        draft: oldStyleDraft({ questionnaireResponses: { consent_basic: 'no' } }),
        decision: 'PUSH_TO_REGISTRY',
        adoptedAt: ADOPTED_AT,
      }),
    ).toThrow(DraftRowError);
  });
});

describe('13-49 payload — buildAdoptionRawData (D3, pending NIN)', () => {
  const d3Draft = () => oldStyleDraft({ questionnaireResponses: { nin: '' } });

  const build = (draft = d3Draft()) =>
    buildAdoptionRawData({ draft, decision: 'PUSH_PENDING_NIN', adoptedAt: ADOPTED_AT });

  /**
   * The amended AC5. `findOrCreateRespondent` mints `pending_nin_capture` when no NIN is
   * present, and `reminder.worker.ts:261` selects exactly `status = 'pending_nin_capture'
   * AND nin IS NULL`. Emitting a NIN key here — even an empty one — is the difference
   * between entering the 9-12 ladder and never being asked for a NIN again.
   */
  it('emits NO nin key at all, so the canonical path mints pending_nin_capture', () => {
    const raw = build();
    expect('nin' in raw).toBe(false);
  });

  it('sets the explicit _pendingNin defer flag rather than relying on absence alone', () => {
    expect(build()._pendingNin).toBe(true);
  });

  it('still carries full identity + all answers — a D3 is an adoption, not a lesser record', () => {
    const raw = build();
    expect(raw.firstname).toBe('Adebayo');
    expect(raw.lga_id).toBe('ibadan-north');
    expect(raw.main_occupation).toBe('Tailor');
    expect(raw._adopted_by).toBe(ADOPTION_MARKER);
  });

  it('REFUSES a D3 that DOES carry a NIN — a contradiction the operator must resolve', () => {
    expect(() =>
      buildAdoptionRawData({
        draft: oldStyleDraft(),
        decision: 'PUSH_PENDING_NIN',
        adoptedAt: ADOPTED_AT,
      }),
    ).toThrow(/NIN/i);
  });

  it('REFUSES a D3 with no phone or no LGA — the ladder needs somewhere to reach them', () => {
    expect(() =>
      buildAdoptionRawData({
        draft: oldStyleDraft({ questionnaireResponses: { nin: '', phone_number: '' } }),
        decision: 'PUSH_PENDING_NIN',
        adoptedAt: ADOPTED_AT,
      }),
    ).toThrow(DraftRowError);
  });
});

/**
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — AC7's CONTACT half.
 *
 * `assertConsentActionable` guarded the two WRITE paths only, so the D4 invite loop mailed 74
 * people without ever reading `consent_basic`. Re-marking one of the 8 `consent_basic = no`
 * drafts as INVITE_TO_RESUME in the workbook would have mailed a person who explicitly said no
 * — R3's hazard, one cohort over, and the same "a sheet is editable, a guard is not" answer.
 *
 * The asymmetry with the adoption guard is deliberate and is the substance of these tests:
 * ADOPTING requires an explicit `yes`; CONTACTING only requires the absence of a `no`. 78 of
 * the 292 drafts carry no questionnaire and therefore no `consent_basic` at all — requiring
 * `yes` here would refuse the entire cohort AC6 exists to reach.
 */
describe('13-49 payload — assertNotConsentRefused (AC7, the CONTACT half)', () => {
  it('REFUSES to contact a draft whose live consent_basic is no', () => {
    expect(() =>
      assertNotConsentRefused(oldStyleDraft({ questionnaireResponses: { consent_basic: 'no' } })),
    ).toThrow(/refusing to CONTACT/i);
  });

  it('names the spreadsheet in the message, because that is what the operator will suspect', () => {
    expect(() =>
      assertNotConsentRefused(oldStyleDraft({ questionnaireResponses: { consent_basic: 'no' } })),
    ).toThrow(/spreadsheet cannot override/i);
  });

  it('ALLOWS a blank consent — a D4 row is a registration that never reached the question', () => {
    expect(() =>
      assertNotConsentRefused(oldStyleDraft({ questionnaireResponses: { consent_basic: '' } })),
    ).not.toThrow();
  });

  it('allows a draft with no questionnaire at all — that is 78 of the 292', () => {
    expect(() =>
      assertNotConsentRefused({ id: 'd', email: 'a@b.com', formData: {} }),
    ).not.toThrow();
  });

  it('allows an explicit yes', () => {
    expect(() => assertNotConsentRefused(oldStyleDraft())).not.toThrow();
  });

  it('is strictly weaker than the adoption guard — blank passes here and fails there', () => {
    const blank = oldStyleDraft({ questionnaireResponses: { consent_basic: '' } });
    expect(() => assertNotConsentRefused(blank)).not.toThrow();
    expect(() => assertConsentActionable(blank)).toThrow(DraftRowError);
  });
});

/**
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — NIN shape, which nothing on this path validated.
 *
 * `buildAdoptionRawData` checked only `!== ''` and `extractRespondentData` passes the value
 * through as `String()`. Measured against the live 292-row snapshot, 2 of the 190 NIN-carrying
 * drafts resolve to a 4- and a 6-character value; both would have been written to a citizen
 * record as `active` and, carrying a NIN, would never have entered the 9-12 ladder that exists
 * to fix exactly this. AC14 states the standard (`^\d{11}$`) — this applies it to the 142.
 */
describe('13-49 payload — NIN shape on the adoption path', () => {
  const withNin = (nin: string) => oldStyleDraft({ questionnaireResponses: { nin } });

  it('accepts a well-formed 11-digit NIN', () => {
    expect(() =>
      buildAdoptionRawData({ draft: withNin('12345678901'), decision: 'PUSH_TO_REGISTRY', adoptedAt: ADOPTED_AT }),
    ).not.toThrow();
  });

  it.each(['1589857782', '123456', '1234', '012345678901', '1234567890A'])(
    'REFUSES to write %s as a NIN — it is not 11 digits',
    (nin) => {
      expect(() =>
        buildAdoptionRawData({ draft: withNin(nin), decision: 'PUSH_TO_REGISTRY', adoptedAt: ADOPTED_AT }),
      ).toThrow(/not 11 digits/i);
    },
  );

  /**
   * ⚠️ THE CROSS-GUARD INTERACTION, and the reason this test exists at all.
   *
   * Two guards face each other here. The recommender routes a MALFORMED NIN to
   * PUSH_PENDING_NIN (a broken field is a field to re-ask, not a NIN we hold). The
   * "D3 must not carry a NIN" guard therefore has to test USABLE, not PRESENT — otherwise
   * the recommender sends those rows to D3 and this guard refuses them, and the 2 affected
   * people end up with no executable disposition anywhere in the programme.
   */
  it('ALLOWS a D3 row whose NIN is malformed — that is precisely why it is D3', () => {
    expect(() =>
      buildAdoptionRawData({ draft: withNin('7474'), decision: 'PUSH_PENDING_NIN', adoptedAt: ADOPTED_AT }),
    ).not.toThrow();
  });

  it('still REFUSES a D3 row whose NIN is VALID — that would discard a real one', () => {
    expect(() =>
      buildAdoptionRawData({ draft: withNin('12345678901'), decision: 'PUSH_PENDING_NIN', adoptedAt: ADOPTED_AT }),
    ).toThrow(/carries a VALID NIN/i);
  });

  it('drops the malformed NIN from the canonical key so it can never be written', () => {
    const raw = buildAdoptionRawData({
      draft: withNin('7474'), decision: 'PUSH_PENDING_NIN', adoptedAt: ADOPTED_AT,
    });
    expect('nin' in raw).toBe(false);
    expect(raw._pendingNin).toBe(true);
  });

  it('PRESERVES the malformed value under a non-canonical key — it is an answer they gave', () => {
    // Silently deleting it would destroy the only record of what the person actually typed,
    // which is what the operator handling their ladder reply needs in order to ask about it.
    const raw = buildAdoptionRawData({
      draft: withNin('7474'), decision: 'PUSH_PENDING_NIN', adoptedAt: ADOPTED_AT,
    });
    expect(raw._rejected_nin).toBe('7474');
  });

  it('does not invent a _rejected_nin for a genuinely empty NIN', () => {
    const raw = buildAdoptionRawData({
      draft: withNin(''), decision: 'PUSH_PENDING_NIN', adoptedAt: ADOPTED_AT,
    });
    expect('_rejected_nin' in raw).toBe(false);
  });

  it('points the operator at PUSH_PENDING_NIN rather than at a silent fix', () => {
    // The remedy must be the LADDER, not padding: a 10-digit value is a dropped leading zero,
    // which is a question for the person, not a guess for a script.
    expect(() =>
      buildAdoptionRawData({ draft: withNin('1589857782'), decision: 'PUSH_TO_REGISTRY', adoptedAt: ADOPTED_AT }),
    ).toThrow(/PUSH_PENDING_NIN/);
  });

  it('shares one pattern with AC14, so the two paths cannot drift', () => {
    expect(NIN_PATTERN.test('27287257118')).toBe(true);
    expect(NIN_PATTERN.test('1589857782')).toBe(false);
  });
});

describe('13-49 payload — non-adoption decisions', () => {
  it('refuses to build a payload for a decision that writes nothing', () => {
    for (const d of ['INVITE_TO_RESUME', 'EXCLUDE_EMPTY', 'EXCLUDE_CONSENT_NO', 'ALREADY_REGISTERED'] as const) {
      expect(() =>
        buildAdoptionRawData({ draft: oldStyleDraft(), decision: d, adoptedAt: ADOPTED_AT }),
      ).toThrow();
    }
  });
});

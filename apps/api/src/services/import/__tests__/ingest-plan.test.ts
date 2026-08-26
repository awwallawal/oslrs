import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { planIngest, type PlanInput } from '../ingest-plan.js';
import type { ParsedRow } from '../parsers/types.js';

function row(rowIndex: number, canonical: ParsedRow['canonical'], warnings: string[] = []): ParsedRow {
  return { rowIndex, canonical, raw: {}, warnings };
}

function basePlan(rows: ParsedRow[], overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    rows,
    hasConsentColumn: false,
    existingIdByPhone: new Map(),
    existingIdByNin: new Map(),
    resolveLga: (raw) => ({ code: null, warning: 'unresolved_lga' }),
    ...overrides,
  };
}

const VALID_PHONE = '+2348012345678';

describe('planIngest — required phone', () => {
  it('fails a row with no phone', () => {
    const plan = planIngest(basePlan([row(0, { firstName: 'Ada' })]));
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.dispositions).toEqual([
      { rowIndex: 0, category: 'failed', reason: 'missing_or_invalid_phone' },
    ]);
  });

  it('fails a row whose phone did not normalise to +234##########', () => {
    const plan = planIngest(basePlan([row(0, { phoneNumber: '12345' })]));
    expect(plan.dispositions[0]).toMatchObject({ category: 'failed', reason: 'missing_or_invalid_phone' });
  });

  it('inserts a valid-phone row (no consent column → consentMarketplace false)', () => {
    const plan = planIngest(basePlan([row(0, { phoneNumber: VALID_PHONE, firstName: 'Ada', lastName: 'Obi' })]));
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0].respondent).toMatchObject({
      phoneNumber: VALID_PHONE,
      firstName: 'Ada',
      lastName: 'Obi',
      consentMarketplace: false,
      nin: null,
    });
  });
});

describe('planIngest — consent gating (only when a consent column exists)', () => {
  it('skips consent=No rows and inserts consent=Yes rows', () => {
    const plan = planIngest(
      basePlan(
        [
          row(0, { phoneNumber: '+2348010000001', consent: 'No' }),
          row(1, { phoneNumber: '+2348010000002', consent: 'Yes' }),
          row(2, { phoneNumber: '+2348010000003', consent: '' }),
        ],
        { hasConsentColumn: true },
      ),
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0].rowIndex).toBe(1);
    expect(plan.toInsert[0].respondent.consentMarketplace).toBe(true);
    const skipped = plan.dispositions.filter((d) => d.category === 'skipped');
    expect(skipped.map((d) => d.rowIndex).sort()).toEqual([0, 2]);
    expect(skipped.every((d) => d.reason === 'consent_not_given')).toBe(true);
  });

  it('ignores consent value entirely when the source has no consent column', () => {
    const plan = planIngest(basePlan([row(0, { phoneNumber: VALID_PHONE, consent: 'No' })]));
    expect(plan.toInsert).toHaveLength(1); // consent column absent → not gated
  });
});

describe('planIngest — dedup on phone/NIN', () => {
  it('matches against an existing respondent by phone (with hashed id)', () => {
    const existingId = 'existing-uuid-1';
    const plan = planIngest(
      basePlan([row(0, { phoneNumber: VALID_PHONE })], {
        existingIdByPhone: new Map([[VALID_PHONE, existingId]]),
      }),
    );
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.dispositions[0]).toEqual({
      rowIndex: 0,
      category: 'matched',
      reason: 'phone_match',
      matchedRespondentIdHash: createHash('sha256').update(existingId).digest('hex'),
    });
  });

  it('matches against an existing respondent by NIN', () => {
    const plan = planIngest(
      basePlan([row(0, { phoneNumber: VALID_PHONE, nin: '12345678901' })], {
        existingIdByNin: new Map([['12345678901', 'nin-owner']]),
      }),
    );
    expect(plan.dispositions[0]).toMatchObject({ category: 'matched', reason: 'nin_match' });
  });

  /*
   * Taxonomy R2 (LOCKED 2026-07-04) — REPLACES the previous "de-dupes duplicate
   * phones WITHIN the same batch" test, which asserted that the second row was
   * DROPPED. Measured against the real association intake, that rule silently
   * discarded 441 people: co-operative and household handsets where two DIFFERENT
   * names share one number. R2 forbids the silent merge; the rows are kept and
   * flagged instead. `respondents.phone_number` is deliberately NOT unique.
   */
  it('R2 — two DIFFERENT people on one handset are both KEPT and flagged, never merged', () => {
    const plan = planIngest(
      basePlan([
        row(0, { phoneNumber: VALID_PHONE, firstName: 'First' }),
        row(1, { phoneNumber: VALID_PHONE, firstName: 'Dup' }),
      ]),
    );
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.dispositions).toHaveLength(0);
    // BOTH are flagged — 12-4 counts every member of a shared-`tel:` group, so
    // flagging only the later arrival could never reconcile with the dashboard.
    expect(plan.identityAmbiguousCount).toBe(2);
    expect(plan.toInsert.every((c) => c.identityAmbiguous)).toBe(true);
    for (const c of plan.toInsert) {
      expect(c.respondent.metadata.normalisation_warnings)
        .toContain('identity:ambiguous_shared_phone_no_nin');
    }
  });

  it('R2 — a NIN outranks a shared phone: distinct NINs are NOT ambiguous', () => {
    const plan = planIngest(
      basePlan([
        row(0, { phoneNumber: VALID_PHONE, nin: '12345678901' }),
        row(1, { phoneNumber: VALID_PHONE, nin: '99999999999' }),
      ]),
    );
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.identityAmbiguousCount).toBe(0);
  });

  it('R2 — a REGISTRY phone match still drops (13-2: do not double-count self-registered members)', () => {
    const plan = planIngest(
      basePlan([row(0, { phoneNumber: VALID_PHONE })], {
        existingIdByPhone: new Map([[VALID_PHONE, 'already-registered']]),
      }),
    );
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.identityAmbiguousCount).toBe(0);
    expect(plan.dispositions[0]).toMatchObject({ category: 'matched', reason: 'phone_match' });
  });
});

describe('planIngest — field shaping', () => {
  it('splits a single fullName into first + rest', () => {
    const plan = planIngest(basePlan([row(0, { phoneNumber: VALID_PHONE, fullName: 'Adewale Samuel Okonkwo' })]));
    expect(plan.toInsert[0].respondent).toMatchObject({ firstName: 'Adewale', lastName: 'Samuel Okonkwo' });
  });

  it('resolves LGA to a code, keeping the raw value + warning when unresolved', () => {
    const plan = planIngest(
      basePlan([row(0, { phoneNumber: VALID_PHONE, lgaId: 'Ona Ara' })], {
        resolveLga: (raw) => (raw === 'Ona Ara' ? { code: 'ona-ara' } : { code: null, warning: 'unresolved_lga' }),
      }),
    );
    expect(plan.toInsert[0].respondent.lgaId).toBe('ona-ara');

    const plan2 = planIngest(
      basePlan([row(0, { phoneNumber: VALID_PHONE, lgaId: 'Adewumi' })], {
        resolveLga: () => ({ code: null, warning: 'unresolved_lga' }),
      }),
    );
    // Unresolved LGA → lgaId stays null (never pollute the code column), raw
    // preserved in metadata for later reconciliation, warning recorded.
    expect(plan2.toInsert[0].respondent.lgaId).toBeNull();
    expect(plan2.toInsert[0].respondent.metadata.import_extra).toMatchObject({ lga_raw: 'Adewumi' });
    expect(plan2.toInsert[0].respondent.metadata.normalisation_warnings).toContain('lgaId:unresolved_lga');
  });

  it('drops an invalid-length NIN to null with a warning but still inserts the row', () => {
    const plan = planIngest(basePlan([row(0, { phoneNumber: VALID_PHONE, nin: '123' })]));
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0].respondent.nin).toBeNull();
    expect(plan.toInsert[0].respondent.metadata.normalisation_warnings).toContain('nin:invalid_dropped');
  });

  it('preserves email + extra source fields in metadata', () => {
    const plan = planIngest(
      basePlan([
        row(0, {
          phoneNumber: VALID_PHONE,
          email: 'ada@example.com',
          profession: 'Tiler',
          gender: 'F',
          town: 'Bodija',
        }),
      ]),
    );
    const meta = plan.toInsert[0].respondent.metadata;
    expect(meta.imported_email).toBe('ada@example.com');
    expect(meta.import_extra).toMatchObject({ profession: 'Tiler', gender: 'F', town: 'Bodija' });
  });

  it('carries the externalReferenceId (ADM NO) through', () => {
    const plan = planIngest(basePlan([row(0, { phoneNumber: VALID_PHONE, externalReferenceId: 'ADM-001' })]));
    expect(plan.toInsert[0].respondent.externalReferenceId).toBe('ADM-001');
  });
});

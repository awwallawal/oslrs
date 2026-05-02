import { describe, it, expect } from 'vitest';
import { planBackfill, type BackfillCandidate } from '../backfill-input-sanitisation.js';

const baseRow = (overrides: Partial<BackfillCandidate>): BackfillCandidate => ({
  id: '019cafdc-0000-7000-a000-000000000000',
  phoneNumber: null,
  dateOfBirth: null,
  metadata: null,
  ...overrides,
});

describe('planBackfill (idempotency + dry-run-safe planner)', () => {
  it('skips rows that are already canonical', () => {
    const plan = planBackfill(
      baseRow({ phoneNumber: '+2348012345678', dateOfBirth: '2000-04-25' }),
    );
    expect(plan.hasChanges).toBe(false);
    expect(plan.failed).toBe(false);
    expect(plan.newMetadata).toBeNull();
    expect(plan.auditDetails.fields).toEqual([]);
  });

  it('canonicalises a non-canonical phone number', () => {
    const plan = planBackfill(baseRow({ phoneNumber: '08012345678' }));
    expect(plan.hasChanges).toBe(true);
    expect(plan.newPhone).toBe('+2348012345678');
    expect(plan.auditDetails.fields).toContain('phone_number');
    expect(plan.auditDetails.hashes.phone_number?.old).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.auditDetails.hashes.phone_number?.new).toMatch(/^[a-f0-9]{64}$/);
    // Hashes never contain plaintext.
    const flat = JSON.stringify(plan.auditDetails);
    expect(flat).not.toContain('08012345678');
    expect(flat).not.toContain('+2348012345678');
  });

  it('canonicalises a DMY date_of_birth to ISO YYYY-MM-DD', () => {
    const plan = planBackfill(baseRow({ dateOfBirth: '25/04/2000' }));
    expect(plan.hasChanges).toBe(true);
    expect(plan.newDob).toBe('2000-04-25');
    expect(plan.auditDetails.fields).toContain('date_of_birth');
  });

  it('flags backfill_failed when phone cannot be canonicalised', () => {
    const plan = planBackfill(baseRow({ phoneNumber: 'not-a-phone' }));
    expect(plan.failed).toBe(true);
    expect(plan.newMetadata?.backfill_failed).toBe(true);
    expect(plan.newMetadata?.normalisation_warnings).toBeDefined();
  });

  it('flags backfill_failed when DOB cannot be parsed', () => {
    const plan = planBackfill(baseRow({ dateOfBirth: 'gibberish' }));
    expect(plan.failed).toBe(true);
    expect(plan.newMetadata?.backfill_failed).toBe(true);
  });

  it('is idempotent — re-planning a row that was already migrated produces no change', () => {
    // First pass migrates the row.
    const first = planBackfill(baseRow({ phoneNumber: '08012345678' }));
    // Simulate the row state after first-pass UPDATE.
    const second = planBackfill(
      baseRow({
        phoneNumber: first.newPhone,
        metadata: first.newMetadata,
      }),
    );
    expect(second.hasChanges).toBe(false);
    expect(second.auditDetails.fields).toEqual([]);
  });

  it('preserves and de-duplicates pre-existing metadata.normalisation_warnings', () => {
    const plan = planBackfill(
      baseRow({
        phoneNumber: '08012345678',
        metadata: {
          normalisation_warnings: ['phone_number:already_warned', 'first_name:all_caps'],
        },
      }),
    );
    expect(plan.newMetadata?.normalisation_warnings).toEqual(
      expect.arrayContaining([
        'phone_number:already_warned',
        'first_name:all_caps',
      ]),
    );
    // No duplicates introduced.
    const counts = (plan.newMetadata?.normalisation_warnings ?? []).reduce<
      Record<string, number>
    >((acc, w) => {
      acc[w] = (acc[w] ?? 0) + 1;
      return acc;
    }, {});
    for (const c of Object.values(counts)) expect(c).toBe(1);
  });

  it('audit hash is SHA-256 (64 hex chars) — never plaintext', () => {
    const plan = planBackfill(baseRow({ phoneNumber: '08012345678' }));
    const hashOld = plan.auditDetails.hashes.phone_number?.old;
    expect(hashOld).toMatch(/^[a-f0-9]{64}$/);
  });
});

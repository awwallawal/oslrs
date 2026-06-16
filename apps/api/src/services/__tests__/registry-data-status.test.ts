import { describe, it, expect } from 'vitest';
import {
  deriveDataStatus,
  hasNonEmptyRawData,
  REGISTRY_DATA_STATUSES,
} from '../registry-data-status.js';

describe('deriveDataStatus', () => {
  it('returns "completed" when the latest submission has answers (highest precedence)', () => {
    // Even if a loss marker or pending status is also present, answers win.
    expect(
      deriveDataStatus({
        hasSubmissionData: true,
        status: 'pending_nin_capture',
        metadata: { questionnaire_data_lost: true },
      }),
    ).toBe('completed');
  });

  it('returns "data_lost" when the irrecoverable-loss marker is set and no answers', () => {
    expect(
      deriveDataStatus({
        hasSubmissionData: false,
        status: 'active',
        metadata: { questionnaire_data_lost: true },
      }),
    ).toBe('data_lost');
  });

  it('returns "pending_nin" for a self-deferred NIN capture with no answers/loss', () => {
    expect(
      deriveDataStatus({ hasSubmissionData: false, status: 'pending_nin_capture' }),
    ).toBe('pending_nin');
  });

  it('returns "nin_unavailable" for the nin_unavailable lifecycle state', () => {
    expect(
      deriveDataStatus({ hasSubmissionData: false, status: 'nin_unavailable' }),
    ).toBe('nin_unavailable');
  });

  it('returns "imported" for an imported_unverified status', () => {
    expect(
      deriveDataStatus({ hasSubmissionData: false, status: 'imported_unverified' }),
    ).toBe('imported');
  });

  it('returns "imported" for an imported_* source even when status is active', () => {
    expect(
      deriveDataStatus({ hasSubmissionData: false, status: 'active', source: 'imported_itf_supa' }),
    ).toBe('imported');
    expect(
      deriveDataStatus({ hasSubmissionData: false, source: 'imported_other' }),
    ).toBe('imported');
  });

  it('returns "no_submission" for an active field respondent with no answers', () => {
    expect(
      deriveDataStatus({ hasSubmissionData: false, status: 'active', source: 'enumerator' }),
    ).toBe('no_submission');
  });

  it('handles missing/null status, source, and metadata gracefully', () => {
    expect(deriveDataStatus({ hasSubmissionData: false })).toBe('no_submission');
    expect(
      deriveDataStatus({ hasSubmissionData: false, status: null, source: null, metadata: null }),
    ).toBe('no_submission');
  });

  it('only ever returns a value from the canonical taxonomy', () => {
    const inputs = [
      { hasSubmissionData: true },
      { hasSubmissionData: false, metadata: { questionnaire_data_lost: true } },
      { hasSubmissionData: false, status: 'pending_nin_capture' },
      { hasSubmissionData: false, status: 'nin_unavailable' },
      { hasSubmissionData: false, source: 'imported_other' },
      { hasSubmissionData: false },
    ];
    for (const input of inputs) {
      expect(REGISTRY_DATA_STATUSES).toContain(deriveDataStatus(input));
    }
  });

  it('reproduces the documented prod 139 = 76 + 55 + 1 + 7 split', () => {
    const counts: Record<string, number> = {};
    const tally = (s: string) => (counts[s] = (counts[s] ?? 0) + 1);
    for (let i = 0; i < 76; i++) tally(deriveDataStatus({ hasSubmissionData: true }));
    for (let i = 0; i < 55; i++)
      tally(deriveDataStatus({ hasSubmissionData: false, metadata: { questionnaire_data_lost: true } }));
    tally(deriveDataStatus({ hasSubmissionData: false, status: 'pending_nin_capture' }));
    for (let i = 0; i < 7; i++)
      tally(deriveDataStatus({ hasSubmissionData: false, status: 'active', source: 'enumerator' }));

    expect(counts).toEqual({ completed: 76, data_lost: 55, pending_nin: 1, no_submission: 7 });
  });
});

describe('hasNonEmptyRawData', () => {
  it('is false for null/undefined', () => {
    expect(hasNonEmptyRawData(null)).toBe(false);
    expect(hasNonEmptyRawData(undefined)).toBe(false);
  });

  it('is false for an empty object', () => {
    expect(hasNonEmptyRawData({})).toBe(false);
  });

  it('is true for an object with at least one key', () => {
    expect(hasNonEmptyRawData({ gender: 'male' })).toBe(true);
  });

  it('is false for non-object primitives', () => {
    expect(hasNonEmptyRawData('some string')).toBe(false);
    expect(hasNonEmptyRawData(42)).toBe(false);
  });
});

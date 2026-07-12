import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  buildPinTimeline,
  resolvePinnedFormAt,
  resolveRows,
  type PinEvent,
} from '../_backfill-public-form-binding.js';

// Story 13-23 (AC4) — the pure decision core of the sentinel backfill. The DB
// plumbing is thin; correctness lives in timeline reconstruction + pin
// resolution + the "only bind when unambiguous" rule, all covered here.

const FORM_A = '019f48c2-aaaa-7000-8000-00000000000a';
const FORM_B = '019f48c2-bbbb-7000-8000-00000000000b';

describe('parseArgs', () => {
  it('parses dry-run / apply / confirm / max-rows', () => {
    expect(parseArgs(['--dry-run'])).toMatchObject({ dryRun: true, apply: false });
    expect(parseArgs(['--apply', '--confirm-i-am-not-dry-running'])).toMatchObject({
      apply: true,
      confirmLive: true,
    });
    expect(parseArgs(['--dry-run', '--max-rows', '5']).maxRows).toBe(5);
  });

  it('throws on an unknown flag (typo-safety)', () => {
    expect(() => parseArgs(['--aply'])).toThrow(/Unknown flag/);
  });
});

describe('buildPinTimeline', () => {
  it('maps UUID new_values through, tombstones clears/non-UUIDs, sorts ascending', () => {
    const timeline = buildPinTimeline([
      { created_at: '2026-07-06T00:00:00Z', new_value: FORM_A },
      { created_at: '2026-07-02T00:00:00Z', new_value: 'not-a-uuid' }, // tombstone ''
      { created_at: '2026-07-09T00:00:00Z', new_value: FORM_B },
      { created_at: '2026-07-05T00:00:00Z', new_value: null }, // cleared → tombstone ''
    ]);
    // Story 13-23 (M2) — clears are KEPT as tombstones (formId=''), not dropped,
    // so a cleared window resolves to "no pinned form" instead of carrying the
    // prior form forward. Sorted ascending by time.
    expect(timeline.map((e) => e.formId)).toEqual(['', '', FORM_A, FORM_B]);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].at.getTime()).toBeLessThanOrEqual(timeline[i].at.getTime());
    }
  });

  it('drops only rows whose timestamp is unparseable', () => {
    const timeline = buildPinTimeline([
      { created_at: 'not-a-date', new_value: FORM_A }, // dropped (bad date)
      { created_at: '2026-07-06T00:00:00Z', new_value: FORM_B },
    ]);
    expect(timeline.map((e) => e.formId)).toEqual([FORM_B]);
  });
});

describe('resolvePinnedFormAt', () => {
  const timeline: PinEvent[] = [
    { at: new Date('2026-07-06T00:00:00Z'), formId: FORM_A },
    { at: new Date('2026-07-09T00:00:00Z'), formId: FORM_B },
  ];

  it('returns null BEFORE the first pin event (unknown → do not guess)', () => {
    expect(resolvePinnedFormAt(timeline, new Date('2026-07-01T00:00:00Z'))).toBeNull();
  });

  it('resolves to the latest pin at-or-before the instant', () => {
    expect(resolvePinnedFormAt(timeline, new Date('2026-07-07T00:00:00Z'))).toBe(FORM_A);
    expect(resolvePinnedFormAt(timeline, new Date('2026-07-10T00:00:00Z'))).toBe(FORM_B);
  });

  it('treats the pin boundary as inclusive (<=)', () => {
    expect(resolvePinnedFormAt(timeline, new Date('2026-07-06T00:00:00Z'))).toBe(FORM_A);
    expect(resolvePinnedFormAt(timeline, new Date('2026-07-09T00:00:00Z'))).toBe(FORM_B);
  });

  it('returns null inside a CLEARED window instead of carrying the prior form forward (M2)', () => {
    // FORM_A pinned at 07-06, then CLEARED at 07-08. A submission at 07-08.5
    // must NOT bind to FORM_A — no form was actually pinned then.
    const cleared: PinEvent[] = [
      { at: new Date('2026-07-06T00:00:00Z'), formId: FORM_A },
      { at: new Date('2026-07-08T00:00:00Z'), formId: '' }, // tombstone (pin cleared)
    ];
    expect(resolvePinnedFormAt(cleared, new Date('2026-07-08T12:00:00Z'))).toBeNull();
    // …but a RE-PIN after the clear resolves normally.
    const rePinned: PinEvent[] = [
      ...cleared,
      { at: new Date('2026-07-09T00:00:00Z'), formId: FORM_B },
    ];
    expect(resolvePinnedFormAt(rePinned, new Date('2026-07-10T00:00:00Z'))).toBe(FORM_B);
  });
});

describe('resolveRows', () => {
  const timeline: PinEvent[] = [{ at: new Date('2026-07-06T00:00:00Z'), formId: FORM_A }];
  const formCreatedAt = new Map<string, Date>([[FORM_A, new Date('2026-07-06T00:00:00Z')]]);

  it('BINDS a row whose pin is known, still exists, and predates the submission', () => {
    const rows = [
      { submissionUid: 's1', submittedAt: new Date('2026-07-07T00:00:00Z'), respondentId: 'r1' },
    ];
    expect(resolveRows(rows, timeline, formCreatedAt)).toEqual([
      { kind: 'bind', submissionUid: 's1', formId: FORM_A },
    ]);
  });

  it('SKIPS a row submitted before any pin event (undeterminable — leave the sentinel)', () => {
    const rows = [
      { submissionUid: 's2', submittedAt: new Date('2026-07-01T00:00:00Z'), respondentId: 'r2' },
    ];
    expect(resolveRows(rows, timeline, formCreatedAt)[0]).toMatchObject({
      kind: 'skip',
      reason: 'no-pin-event-at-submit',
    });
  });

  it('SKIPS a row submitted inside a CLEARED window (M2 — never misbinds to the prior form)', () => {
    const clearedTimeline: PinEvent[] = [
      { at: new Date('2026-07-06T00:00:00Z'), formId: FORM_A },
      { at: new Date('2026-07-08T00:00:00Z'), formId: '' }, // cleared
    ];
    const rows = [
      { submissionUid: 's-cleared', submittedAt: new Date('2026-07-08T12:00:00Z'), respondentId: 'r' },
    ];
    expect(resolveRows(rows, clearedTimeline, formCreatedAt)[0]).toMatchObject({
      kind: 'skip',
      reason: 'no-pin-event-at-submit',
    });
  });

  it('SKIPS when the pinned form no longer exists', () => {
    const rows = [
      { submissionUid: 's3', submittedAt: new Date('2026-07-07T00:00:00Z'), respondentId: 'r3' },
    ];
    expect(resolveRows(rows, timeline, new Map())[0]).toMatchObject({
      kind: 'skip',
      reason: 'pinned-form-no-longer-exists',
    });
  });

  it('SKIPS when the pinned form was created AFTER the submission (clock-skew guard)', () => {
    const later = new Map<string, Date>([[FORM_A, new Date('2026-07-08T00:00:00Z')]]);
    const rows = [
      { submissionUid: 's4', submittedAt: new Date('2026-07-07T00:00:00Z'), respondentId: 'r4' },
    ];
    expect(resolveRows(rows, timeline, later)[0]).toMatchObject({
      kind: 'skip',
      reason: 'pinned-form-created-after-submit',
    });
  });

  it('is deterministic across re-runs (idempotent planning — a second pass yields identical resolutions)', () => {
    const rows = [
      { submissionUid: 's1', submittedAt: new Date('2026-07-07T00:00:00Z'), respondentId: 'r1' },
      { submissionUid: 's2', submittedAt: new Date('2026-07-01T00:00:00Z'), respondentId: 'r2' },
    ];
    const first = resolveRows(rows, timeline, formCreatedAt);
    const second = resolveRows(rows, timeline, formCreatedAt);
    expect(second).toEqual(first);
  });
});

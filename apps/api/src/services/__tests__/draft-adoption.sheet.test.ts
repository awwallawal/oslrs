import { describe, it, expect } from 'vitest';
import {
  parseDecisionRows,
  reconcileDraftIds,
  type RawDecisionRow,
} from '../draft-adoption/sheet.js';

/**
 * Story 13-49 Task 2 — the sheet reader FAILS CLOSED.
 *
 * AC2: "The script READS that column and refuses to act on any row whose decision is
 * blank or unrecognised." Refuses — not skips. A skipped row on this path is a citizen
 * silently dropped out of the programme, and the failure mode is invisible: the run
 * reports success with a smaller number nobody cross-checks.
 */

const row = (draftId: string, decision: string, rowNumber = 2): RawDecisionRow => ({
  rowNumber,
  draftId,
  decision,
});

describe('13-49 sheet — parseDecisionRows', () => {
  it('returns a draft_id → decision map for a clean sheet', () => {
    const result = parseDecisionRows([
      row('draft-a', 'PUSH_TO_REGISTRY', 2),
      row('draft-b', 'PUSH_PENDING_NIN', 3),
      row('draft-c', 'EXCLUDE_CONSENT_NO', 4),
    ]);
    expect(result.size).toBe(3);
    expect(result.get('draft-a')).toBe('PUSH_TO_REGISTRY');
    expect(result.get('draft-b')).toBe('PUSH_PENDING_NIN');
  });

  it('THROWS on a blank decision, naming the sheet row', () => {
    expect(() => parseDecisionRows([row('draft-a', 'PUSH_TO_REGISTRY', 2), row('draft-b', '', 3)]))
      .toThrow(/row 3/);
  });

  it('THROWS on a whitespace-only decision (a blank that looks filled in)', () => {
    expect(() => parseDecisionRows([row('draft-a', '   ', 2)])).toThrow(/row 2/);
  });

  it('THROWS on an unrecognised decision, and ECHOES the offending value', () => {
    expect(() => parseDecisionRows([row('draft-a', 'DELETE_THEM', 2)])).toThrow(/DELETE_THEM/);
  });

  it('THROWS on a near-miss rather than normalising it — no guessing on a write path', () => {
    // Someone typing over the dropdown is exactly when to stop and show the operator.
    expect(() => parseDecisionRows([row('draft-a', 'push_to_registry', 2)])).toThrow(/row 2/);
    expect(() => parseDecisionRows([row('draft-a', 'PUSH_TO_REGISTRY ', 2)])).toThrow(/row 2/);
  });

  it('reports EVERY bad row at once, not just the first — one pass, one fix', () => {
    let message = '';
    try {
      parseDecisionRows([
        row('draft-a', 'PUSH_TO_REGISTRY', 2),
        row('draft-b', '', 3),
        row('draft-c', 'NONSENSE', 4),
        row('draft-d', '   ', 5),
      ]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/row 3/);
    expect(message).toMatch(/row 4/);
    expect(message).toMatch(/row 5/);
    expect(message).toMatch(/3 row/); // the count, so the operator knows the scale
  });

  it('THROWS on a duplicate draft_id — two decisions for one person is not resolvable', () => {
    expect(() =>
      parseDecisionRows([row('draft-a', 'PUSH_TO_REGISTRY', 2), row('draft-a', 'INVITE_TO_RESUME', 3)]),
    ).toThrow(/duplicate/i);
  });

  it('THROWS on a blank draft_id — an unkeyed decision cannot be applied to anyone', () => {
    expect(() => parseDecisionRows([row('', 'PUSH_TO_REGISTRY', 2)])).toThrow(/row 2/);
  });

  it('accepts an empty sheet without throwing (zero rows is a valid, if useless, run)', () => {
    expect(parseDecisionRows([]).size).toBe(0);
  });
});

describe('13-49 sheet — reconcileDraftIds', () => {
  it('passes when the sheet and the live table describe the same set', () => {
    expect(() => reconcileDraftIds(new Set(['a', 'b']), new Set(['a', 'b']))).not.toThrow();
  });

  it('THROWS when the sheet references a draft that is not live — a stale sheet is a wrong sheet', () => {
    expect(() => reconcileDraftIds(new Set(['a', 'ghost']), new Set(['a']))).toThrow(/ghost/);
  });

  it('THROWS when a live draft has no decision — nobody may be silently left out', () => {
    // The whole programme is "every draft adjudicated to a disposition" (the story title).
    // A live draft missing from the sheet is precisely the row that would be forgotten.
    expect(() => reconcileDraftIds(new Set(['a']), new Set(['a', 'unjudged']))).toThrow(/unjudged/);
  });

  it('reports counts on both sides so a 292-vs-291 mismatch is legible', () => {
    let message = '';
    try {
      reconcileDraftIds(new Set(['a', 'b']), new Set(['a', 'c']));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/b/);
    expect(message).toMatch(/c/);
  });

  it('truncates a very long id list so the error stays readable', () => {
    const live = new Set(Array.from({ length: 50 }, (_, i) => `live-${i}`));
    let message = '';
    try {
      reconcileDraftIds(new Set<string>(), live);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/50/); // the count is always exact…
    expect(message.length).toBeLessThan(1200); // …even though the list is clipped
  });
});

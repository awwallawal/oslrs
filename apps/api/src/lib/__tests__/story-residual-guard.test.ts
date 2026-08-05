import { describe, it, expect } from 'vitest';
import {
  findDoneStoriesWithOpenResiduals,
  isOpenState,
  formatResidualHits,
} from '../story-residual-guard.js';

/**
 * Story 13-45. The states below are REAL ones lifted from 13-49's ledger, because the compound
 * shapes are the whole difficulty: a naive `includes('OPEN')` flags rows that are resolved, and a
 * naive `includes('CLOSED')` misses rows that are half-closed and still blocking.
 */
describe('13-45 — done-with-open-residuals guard', () => {
  describe('isOpenState', () => {
    it('flags a plainly open residual', () => {
      expect(isOpenState('**OPEN — blocks `done`.**')).toBe(true);
      expect(isOpenState('OPEN — accepted for now, deliberately')).toBe(true);
    });

    it('does NOT flag a closed one, however it is spelled', () => {
      expect(isOpenState('**CLOSED**')).toBe(false);
      expect(isOpenState('✅ **CLOSED 2026-08-03 — EXECUTED LIVE ON PROD**')).toBe(false);
      expect(isOpenState('ACCEPTED — documented behaviour')).toBe(false);
    });

    /**
     * The compound states are why this is not a substring check. Both of these contain the word
     * OPEN and are NOT open; the first also contains CLOSED.
     */
    it('does not flag compound states that resolve', () => {
      expect(isOpenState('**was: OPEN — BLOCKED ON DEPLOY** · now CLOSED')).toBe(false);
      expect(isOpenState('✅ RESOLVED — by reading the code, deliberately NOT by a live test')).toBe(false);
    });

    it('ignores the R11 "REOPEN TRIGGER" note, which is monitoring, not a state', () => {
      expect(isOpenState('R11 REOPEN TRIGGER: every promotion must have an audit row')).toBe(false);
    });
  });

  const ledger = (rows: string) => `# Story X\n\nStatus: done\n\n## Residuals\n\n| ID | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n${rows}`;

  it('blocks a done story that still carries an open residual', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      { path: 'a.md', content: ledger('| **R4** — text | Medium | **OPEN — spec-vs-ship** | x | dev |\n') },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.residualId).toBe('R4');
  });

  it('allows a done story whose residuals are all closed or accepted', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      {
        path: 'a.md',
        content: ledger(
          '| ~~**R9**~~ ✅ **CLOSED** | Medium | **CLOSED** | evidence | done |\n' +
            '| **R6** — text | Low | ACCEPTED — documented behaviour | — | — |\n',
        ),
      },
    ]);
    expect(hits).toHaveLength(0);
  });

  it('skips struck-through ids — the repo convention for a resolved row', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      { path: 'a.md', content: ledger('| ~~**R9**~~ superseded | Medium | **was: OPEN** | x | y |\n') },
    ]);
    expect(hits).toHaveLength(0);
  });

  /** The guard exists for `done`. A story still in review is allowed to carry open work. */
  it('ignores stories that are not done', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      {
        path: 'a.md',
        content: '# Story\n\nStatus: review\n\n| **R1** — t | High | **OPEN** | x | y |\n',
      },
    ]);
    expect(hits).toHaveLength(0);
  });

  it('does not treat ordinary tables as residual ledgers', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      {
        path: 'a.md',
        content: 'Status: done\n\n| Cohort | Count | Note |\n|---|---|---|\n| D1 | 140 | OPEN question |\n',
      },
    ]);
    expect(hits).toHaveLength(0);
  });

  it('reports every open row, grouped by story', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      {
        path: 'a.md',
        content: ledger(
          '| **R1** — a | High | **OPEN** | x | y |\n| **R2** — b | Low | **OPEN — accepted** | x | y |\n',
        ),
      },
    ]);
    expect(hits).toHaveLength(2);
    expect(formatResidualHits(hits)).toContain('2 residual(s) still OPEN');
  });
});

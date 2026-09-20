import { describe, it, expect } from 'vitest';
import {
  findDoneStoriesWithOpenResiduals,
  findExpiredDatedResiduals,
  isOpenState,
  formatResidualHits,
  formatExpiredResiduals,
  toUtcDateKey,
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

/**
 * Two holes found at adjudication on 2026-08-20, each with a live repro in the repo at the time.
 * Both are the same shape: the guard reported "317 stories scanned, none open" while stories that
 * violated §2a0 sat in front of it.
 */
describe('13-45 — the two holes closed 2026-08-20', () => {
  const doneWithLedger = (rows: string) =>
    `Status: done\n\n## Residuals\n\n| # | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n${rows}`;

  describe('hole 1 — DISCHARGE-ON-* was never treated as open', () => {
    it('flags DISCHARGE-ON-PUSH and DISCHARGE-ON-DEPLOY', () => {
      // §2a0 defines these verbatim as "provable only after deploy. Blocks `done`, not the commit."
      // The old predicate required the literal word OPEN, so both walked straight through.
      expect(isOpenState('**DISCHARGE-ON-PUSH** — provable only after deploy')).toBe(true);
      expect(isOpenState('**DISCHARGE-ON-DEPLOY**')).toBe(true);
    });

    it('still does NOT flag one that was actually discharged', () => {
      expect(isOpenState('✅ DISCHARGED ON PROD 2026-08-15 — was DISCHARGE-ON-DEPLOY')).toBe(false);
      expect(isOpenState('DISCHARGE-ON-DEPLOY — CLOSED, deploy f6b449d')).toBe(false);
    });

    it('reproduces the 13-59 R1 row that the guard used to miss', () => {
      const hits = findDoneStoriesWithOpenResiduals([
        { path: '13-59.md', content: doneWithLedger('| **R1** | High | **DISCHARGE-ON-DEPLOY** | activate one real staff account | dev |\n') },
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.residualId).toBe('R1');
    });
  });

  describe('hole 2 — a story with NO ledger was policed by nothing', () => {
    it('flags prose residual language when the story has no ledger', () => {
      // The 12-5 repro: Status: done, no ## Residuals section, and an explicit pre-deploy residual
      // in the body. Zero table rows to match, so the row scan reported nothing.
      const hits = findDoneStoriesWithOpenResiduals([
        {
          path: '12-5.md',
          content: 'Status: done\n\n⛔ **PRE-DEPLOY RESIDUAL — the rate WILL MOVE on the dashboard.**\n',
        },
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.residualId).toBe('prose');
    });

    it('does NOT double-report when a ledger already carries the row', () => {
      // A story WITH a ledger is policed by the row scan; adding a prose hit too would flag the
      // same debt twice and train people to ignore the guard.
      const hits = findDoneStoriesWithOpenResiduals([
        { path: 'a.md', content: doneWithLedger('| **R1** | High | **DISCHARGE-ON-DEPLOY** | x | y |\n') },
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.residualId).toBe('R1');
    });

    it('leaves a clean done story alone — the guard must stay quiet when it should', () => {
      const hits = findDoneStoriesWithOpenResiduals([
        { path: 'a.md', content: 'Status: done\n\nNothing outstanding here.\n' },
        { path: 'b.md', content: doneWithLedger('| **R1** | Low | ✅ CLOSED on prod | x | y |\n') },
      ]);
      expect(hits).toHaveLength(0);
    });
  });
});

/**
 * Story 13-70 FR4 — a deferral that names a date must fail the build once the date passes, and an
 * undated one must never fail on time.
 *
 * ⛔ BOTH DIRECTIONS IN EVERY CASE. A date check that only fires one way is half a guard: one that
 * only reds is disabled within a week (959 of this repo's table rows carry a date and almost all of
 * them are EVIDENCE, not deadlines); one that only passes is decoration.
 *
 * The clock is injected everywhere. `new Date()` in a test would make this suite change its answer
 * on 2026-10-16, which is precisely the property under test.
 */
describe('13-70 FR4 — an expired DATED deferral fails the build (AC6/AC8/AC11/AC12)', () => {
  const TODAY = new Date('2026-09-20T09:00:00.000Z');
  const ledger = (rows: string) =>
    `# Story X\n\nStatus: review\n\n## Residuals\n\n| ID | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n${rows}`;

  it('flags an open row whose DATED deadline has passed, and names the DATE', () => {
    const hits = findExpiredDatedResiduals(
      [{ path: 'a.md', content: ledger('| **R2b** — cardinality monitor | High | OPEN — **DATED 2026-08-15** | grep … | Bob |\n') }],
      TODAY,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.residualId).toBe('R2b');
    expect(hits[0]!.dueOn).toBe('2026-08-15');
  });

  it('does NOT flag one whose date is still in the future — R2b must stay quiet until 2026-10-16', () => {
    const row = '| **R2b** — cardinality monitor | High | OPEN — **DATED 2026-10-15** | grep … | Bob |\n';
    const file = [{ path: 'a.md', content: ledger(row) }];
    expect(findExpiredDatedResiduals(file, TODAY)).toHaveLength(0);
    // The day itself is not yet late; the day after is. This is the real row and the real date.
    expect(findExpiredDatedResiduals(file, new Date('2026-10-15T23:59:59.000Z'))).toHaveLength(0);
    expect(findExpiredDatedResiduals(file, new Date('2026-10-16T00:00:01.000Z'))).toHaveLength(1);
  });

  /**
   * AC11 — THE OPT-IN PROPERTY, and the reason this guard is usable at all. Measured 2026-09-20:
   * 959 table rows across 157 files carry a date; exactly ONE is a `DATED` deferral marker. A rule
   * that parsed any past date would red essentially the whole repo on its first run.
   */
  it('⛔ AC11 a row carrying an EVIDENCE date and no marker never expires, however old the date', () => {
    const hits = findExpiredDatedResiduals(
      [{
        path: 'a.md',
        content: ledger(
          '| **R4** — stale row | Low | OPEN — pre-existing, found 2026-02-14 | measured 2026-08-07, fixed 2026-08-07 | dev |\n' +
          '| **R5** — keyspace | Med | OPEN — out of scope | prefix pairs seen 2020-01-01 | adjudication |\n',
        ),
      }],
      TODAY,
    );
    expect(hits).toEqual([]);
  });

  /** AC6's other direction on the shape this repo actually uses most: a trigger, not a date. */
  it('AC6 a trigger-based row with no date never fails on time', () => {
    const hits = findExpiredDatedResiduals(
      [{
        path: 'a.md',
        content: ledger(
          '| **R1** — flood headroom | Medium | **OPEN** — a decision is owed BEFORE the cohort grows | 244 refusals from six Opera Mini addresses on 2026-09-07/08 | Awwal |\n',
        ),
      }],
      TODAY,
    );
    expect(hits).toEqual([]);
  });

  /**
   * AC12 — `/DATED 20\d\d-/` without a word boundary matches inside `UPDATED 2026-…`, a line shape
   * this repo writes constantly. It cost the authoring pass a false finding. Both strings live in
   * ONE fixture so the test cannot pass by only ever seeing one of them.
   */
  it('⛔ AC12 DATED does not match inside UPDATED', () => {
    const content = ledger(
      '| **R6** — evidence row | Low | OPEN — UPDATED 2026-01-05 after the re-measure | re-run the query | dev |\n' +
      '| **R7** — real deferral | High | OPEN — DATED 2026-01-05 | re-run the query | dev |\n',
    );
    const hits = findExpiredDatedResiduals([{ path: 'a.md', content }], TODAY);
    expect(hits.map((h) => h.residualId)).toEqual(['R7']);
  });

  it('does not flag a row that is closed, however it is spelled', () => {
    const hits = findExpiredDatedResiduals(
      [{
        path: 'a.md',
        content: ledger(
          '| **R8** | High | ✅ CLOSED — DATED 2026-01-01, done on 2026-02-02 | evidence | dev |\n' +
          '| **R9** | High | RESOLVED — was DATED 2026-01-01 | evidence | dev |\n' +
          '| ~~**R10**~~ | High | was OPEN — DATED 2026-01-01 | evidence | dev |\n',
        ),
      }],
      TODAY,
    );
    expect(hits).toEqual([]);
  });

  /** It is NOT gated on `Status: done` — 13-68 is `review`, and it holds the only dated row there is. */
  it('fires on a story that is not done — an expiring deferral is the opposite case to the done-scan', () => {
    const content = 'Status: review\n\n## Residuals\n\n| ID | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n| **R2b** | High | OPEN — DATED 2026-08-15 | x | Bob |\n';
    expect(findExpiredDatedResiduals([{ path: '13-68.md', content }], TODAY)).toHaveLength(1);
  });

  /** AC8 — the operator must be able to act without opening the story file. */
  it('AC8 the message carries the row own text and the date, not a line number', () => {
    const hits = findExpiredDatedResiduals(
      [{ path: 'a.md', content: ledger('| **R2b** — distinct-identifier cardinality monitor | High | OPEN — **DATED 2026-08-15** | grep … | Bob (SM) |\n') }],
      TODAY,
    );
    const message = formatExpiredResiduals(hits, TODAY);
    expect(message).toContain('distinct-identifier cardinality monitor');
    expect(message).toContain('DATED 2026-08-15');
    expect(message).toContain('2026-09-20');
    expect(message).not.toMatch(/line \d+/);
  });

  /** 4.1d — one clock, UTC, so the guard cannot flip state at local midnight. */
  it('reads "today" in UTC from the injected clock, not from the local timezone', () => {
    // 2026-08-16T00:30 in UTC+2 is still 2026-08-15 in UTC — the row is due, not overdue.
    expect(toUtcDateKey(new Date('2026-08-15T22:30:00.000Z'))).toBe('2026-08-15');
    const row = ledger('| **R2b** | High | OPEN — DATED 2026-08-15 | x | Bob |\n');
    expect(findExpiredDatedResiduals([{ path: 'a.md', content: row }], new Date('2026-08-15T22:30:00.000Z'))).toHaveLength(0);
  });
});

/**
 * Story 13-70 AC7 — THE GUARD MUST BE ABLE TO SEE THE ROW AT ALL.
 *
 * `RESIDUAL_ID` matched `R<digits>` only, so 13-68's `**A1**`/`**A2**`/`**A3**` rows were invisible
 * — and A1 is the residual FR1 closes. Date parsing added on top of an id pattern that skips the row
 * is a fix that cannot fire [[pattern-ship-a-fix-that-never-fires]], which is why widening came
 * FIRST in the task order.
 *
 * RED-VERIFIED ON THE REAL ROW, 2026-09-20: giving 13-68's actual A1 a `DATED 2026-01-01` marker
 * reds the guard and prints the row; narrowing the pattern back to `R\d+` with that marker still in
 * place reports "328 stories scanned, no expired DATED deferrals" — green, over an eight-month-late
 * deadline.
 */
describe('13-70 AC7 — the id pattern is wide enough to see the row, and no wider', () => {
  const TODAY = new Date('2026-09-20T09:00:00.000Z');

  it('matches an A-row — the shape 13-68 actually shipped', () => {
    const content = 'Status: done\n\n## Residuals\n\n| # | residual | why not fixed here | reopen trigger |\n|---|---|---|---|\n' +
      '| **A1** | The accidental proxy block | **OPEN** — not this story to fix | any flood refusal |\n';
    const hits = findDoneStoriesWithOpenResiduals([{ path: '13-68.md', content }]);
    expect(hits.map((h) => h.residualId)).toEqual(['A1']);
  });

  it('matches an A-row for the date check too', () => {
    const content = '| **A1** | The accidental proxy block | OPEN — DATED 2026-01-01 | any flood refusal |\n';
    expect(findExpiredDatedResiduals([{ path: '13-68.md', content }], TODAY).map((h) => h.residualId)).toEqual(['A1']);
  });

  /**
   * ⛔ AND NO WIDER. `[A-Z]\d+` matches 510 rows instead of 229 — the extra 284 are adversarial-review
   * finding tables (H/M/L/S/P/C/T/B ids), and two of them produce FALSE hits in `done` stories: one
   * because `\bOPEN\b` matches inside "gate-open", one because a three-column review table's third
   * cell is a pointer reading "the OPEN DECISION block". This guard runs in `pre-commit`; a guard
   * that reds every commit gets disabled, and then it protects nothing.
   */
  it('does NOT match a review-severity id like H1/M3/B10, in either check', () => {
    const done = 'Status: done\n\n| H1 | High | **OPEN** — a review finding | x | y |\n' +
      '| M3 | 🟡 MED | the fraud gate-open test header said the same | Read. | Corrected. |\n' +
      '| B10 | note | `13-46.md` Context §9, the OPEN DECISION block |\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content: done }])).toEqual([]);
    expect(findExpiredDatedResiduals([{ path: 'a.md', content: '| H1 | High | OPEN — DATED 2026-01-01 | x | y |\n' }], TODAY)).toEqual([]);
  });

  /** `D` stays out: this suite's own worked example of an ordinary table uses `D1`. */
  it('still does not treat a `| D1 | 140 | OPEN question |` row as a residual', () => {
    expect(findDoneStoriesWithOpenResiduals([
      { path: 'a.md', content: 'Status: done\n\n| Cohort | Count | Note |\n|---|---|---|\n| D1 | 140 | OPEN question |\n' },
    ])).toEqual([]);
  });
});

/**
 * Story 13-70 — CLOSING THE ID CLASS, rather than widening the pattern one letter at a time.
 *
 * The id regex used to do two jobs: name the row, and decide whether the table was a residual
 * ledger at all. That is why it could not be widened safely — every letter added also swept in the
 * adversarial-review finding tables (`H1`, `M3`, `B10`, `S3`, `T4`), where "OPEN" means something
 * else. Splitting the jobs closes both failure modes at once, and was measured on the real corpus
 * before shipping: **0 new hits, 0 lost hits, 0 verdicts changed.**
 */
describe('13-70 — a residual row is decided by its SECTION, not by its id letter', () => {
  const TODAY = new Date('2026-09-20T09:00:00.000Z');
  const ledger = (heading: string, rows: string) =>
    `# Story\n\nStatus: done\n\n${heading}\n\n| # | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n${rows}`;

  /**
   * ⛔ THE §2ab.1 CASE, and the reason this matters more than a wider regex. Adjudication wrote
   * 13-69's ledger with `D1`/`D2` ids and the guard ignored the whole table — which is strictly
   * WORSE than having no ledger, because `HAS_LEDGER` disables the prose fallback for the file. The
   * rows had to be renamed by hand to be seen at all.
   */
  it('sees a D-row inside a Residuals section — the ledger adjudication wrote and the guard ignored', () => {
    const hits = findDoneStoriesWithOpenResiduals([
      { path: '13-69.md', content: ledger('## Residuals', '| **D1** — detections written post-deploy | High | **DISCHARGE-ON-DEPLOY** | read the table 1h after | dev |\n') },
    ]);
    expect(hits.map((h) => h.residualId)).toEqual(['D1']);
  });

  it('recognises the heading shapes this repo actually uses, not just `## Residuals`', () => {
    for (const heading of [
      '## Residuals',
      '### Residuals ledger',
      '### Residual Ledger',
      '### New residuals from adjudication',
      '#### A5 — Residuals after adjudication',
    ]) {
      const hits = findDoneStoriesWithOpenResiduals([
        { path: 'a.md', content: ledger(heading, '| **X7** — something | High | **OPEN** | x | y |\n') },
      ]);
      expect(hits.map((h) => h.residualId), heading).toEqual(['X7']);
    }
  });

  /** ⛔ AND THE SECTION ENDS. A review table after the ledger is back under the strict id rule. */
  it('stops treating rows as residuals once the section closes', () => {
    const content =
      '# Story\n\nStatus: done\n\n## Residuals\n\n| # | Sev | State | E | O |\n|---|---|---|---|---|\n' +
      '| **A1** | High | **OPEN** | x | y |\n' +
      '\n## Senior Developer Review (AI)\n\n| # | Sev | State | E | O |\n|---|---|---|---|---|\n' +
      '| **H1** | High | **OPEN** — a review finding, not a residual | x | y |\n' +
      '| **M3** | Med | the fraud gate-open test header said the same | Read. | Corrected. |\n';
    const hits = findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }]);
    expect(hits.map((h) => h.residualId)).toEqual(['A1']);
  });

  /** A deeper heading inside the ledger does not end it. */
  it('keeps the section open across a deeper sub-heading', () => {
    const content =
      'Status: done\n\n## Residuals\n\n#### Carried over from 13-68\n\n| # | Sev | State | E | O |\n|---|---|---|---|---|\n' +
      '| **D2** | High | **OPEN** | x | y |\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }]).map((h) => h.residualId)).toEqual(['D2']);
  });

  it('applies to the date check on the same terms', () => {
    const content = ledger('## Residuals', '| **D1** | High | OPEN — DATED 2026-01-01 | x | y |\n');
    expect(findExpiredDatedResiduals([{ path: 'a.md', content }], TODAY).map((h) => h.residualId)).toEqual(['D1']);
    // ...and outside a ledger the strict rule still applies, so a review finding cannot expire.
    const loose = 'Status: done\n\n| **H1** | High | OPEN — DATED 2026-01-01 | x | y |\n';
    expect(findExpiredDatedResiduals([{ path: 'a.md', content: loose }], TODAY)).toEqual([]);
  });
});

/**
 * Story 13-70 — an escaped pipe must not move the STATE cell.
 *
 * `\|` is Markdown's literal pipe: it renders as one character and does not start a column. A naive
 * `split('|')` treats it as a separator, so an escaped pipe in the id or severity cell shifts the
 * state out of column 3 and a genuinely OPEN row reports as nothing at all.
 *
 * ⭐ MEASURED BEFORE HARDENING: **0** rows in the repo are judged differently by the two splits —
 * 255 rows do contain an escaped pipe, but in every one it falls in the evidence cell, after column
 * 3. So today's verdicts were right by luck. This pins them by construction instead.
 */
describe('13-70 — cells split on unescaped pipes only', () => {
  it('reads the STATE cell correctly when an earlier cell contains a literal pipe', () => {
    const content =
      'Status: done\n\n## Residuals\n\n| # | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n' +
      '| **R1** — `grep -n "a\\|b" file.ts` found it | High | **OPEN** | re-run the grep | dev |\n';
    const hits = findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.state).toContain('OPEN');
  });

  it('still reads the real repo shape, where the escaped pipe is in the EVIDENCE cell', () => {
    const content =
      'Status: done\n\n## Residuals\n\n| # | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n' +
      '| **R2a** | High | **OPEN** | `grep -n "lockCount\\|lock_count" users.ts` → none | Bob |\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }]).map((h) => h.residualId)).toEqual(['R2a']);
  });
});

/* ------------------------------------------------------------------------------------------------
 * ADVERSARIAL REVIEW OF STORY 13-70, 2026-09-20 — the two holes the section detector shipped with.
 *
 * Both were found by execution, not by reading, and both are RED-VERIFIED against the code as it
 * shipped: reverting either fix reds the block below it. Neither changed any verdict on the real
 * corpus (328 stories, 250 residual rows, 0 done-hits, and the same three rows expiring on
 * 2026-10-16) — they are latent holes hardened, which is stated rather than dressed up as a save
 * [[pattern-a-clean-result-must-prove-it-measured]].
 * ---------------------------------------------------------------------------------------------- */
describe('13-70 review — a fenced code block is not Markdown', () => {
  const TODAY = new Date('2026-09-20T09:00:00.000Z');

  /**
   * ⛔ THE LIVE SHAPE. Story files quote commands constantly, and a shell comment inside a fence is
   * `# something` — which the heading regex reads as a level-1 heading and which therefore CLOSED
   * the ledger section. Measured on the real corpus the day this was found: 156 such lines.
   * Everything after the fence went invisible — the §2ab.1 hazard arriving through another door.
   */
  it('a `#` shell comment inside a fence does not close the ledger section', () => {
    const content =
      'Status: done\n\n## Residuals\n\n| ID | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n' +
      '| D1 | High | OPEN | before the fence | Awwal |\n' +
      '\n```bash\n# Re-run the guard\npnpm run lint:story-residuals\n```\n\n' +
      '| D2 | High | OPEN | after the fence | Awwal |\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }]).map((h) => h.residualId))
      .toEqual(['D1', 'D2']);
  });

  /** The mirror image: a fence must not OPEN a ledger and turn a review-finding table into one. */
  it('a `# Residuals` line inside a fence does not open a ledger section', () => {
    const content =
      'Status: done\n\n## Adversarial review findings\n\n' +
      '```bash\n# Residuals recount\ngrep -c OPEN story.md\n```\n\n' +
      '| H1 | High | OPEN | a review finding, not a residual | reviewer |\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }])).toEqual([]);
  });

  /** A `|` line inside a fence is sample OUTPUT, not a ledger row, and must never be read as one. */
  it('a table-shaped line inside a fence is not a residual row', () => {
    const content =
      'Status: done\n\n## Residuals\n\n' +
      '```\n| R9 | High | OPEN | pasted sample output | nobody |\n```\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }])).toEqual([]);
    expect(findExpiredDatedResiduals([{ path: 'a.md', content:
      '## Residuals\n```\n| R9 | High | OPEN — DATED 2026-01-01 | sample | nobody |\n```\n' }], TODAY))
      .toEqual([]);
  });

  /** `~~~` is the other fence spelling, and this repo uses it where a block contains backticks. */
  it('recognises the ~~~ fence spelling too', () => {
    const content =
      'Status: done\n\n## Residuals\n\n| ID | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n' +
      '| D1 | High | OPEN | before | Awwal |\n' +
      '\n~~~\n# not a heading\n~~~\n\n' +
      '| D2 | High | OPEN | after | Awwal |\n';
    expect(findDoneStoriesWithOpenResiduals([{ path: 'a.md', content }]).map((h) => h.residualId))
      .toEqual(['D1', 'D2']);
  });
});

describe('13-70 review — only the cell that committed to a date may excuse it', () => {
  const TODAY = new Date('2026-10-16T09:00:00.000Z');
  const ledger = (rows: string) =>
    `# Story X\n\n## Residuals\n\n| ID | Sev | State | Evidence | Owner |\n|---|---|---|---|---|\n${rows}`;

  /**
   * ⛔ THE HOLE, REPRODUCED. `ROW_IS_CLOSED` was tested against the WHOLE row, and the evidence
   * column in this repo is prose that routinely says how other rows were disposed of. One such word
   * landing in it turned the deadline off while the row still read OPEN.
   */
  it('a closure word in the EVIDENCE cell does not excuse an open, past-due row', () => {
    const content = ledger(
      '| **R6** | Medium | **OPEN — DATED 2026-10-15** | the sibling question was RESOLVED in 13-68 | Awwal |\n',
    );
    const hits = findExpiredDatedResiduals([{ path: 'a.md', content }], TODAY);
    expect(hits.map((h) => h.residualId)).toEqual(['R6']);
    expect(hits[0]!.dueOn).toBe('2026-10-15');
  });

  /** ...and the opt-out still works when it sits where the commitment was made. */
  it('a closure word in the cell carrying the marker DOES excuse it', () => {
    const content = ledger(
      '| **R6** | Medium | ✅ CLOSED — was DATED 2026-10-15 | the sibling question was settled | Awwal |\n',
    );
    expect(findExpiredDatedResiduals([{ path: 'a.md', content }], TODAY)).toEqual([]);
  });

  /** The `~~struck~~` convention is an id-cell signal and must keep working. */
  it('a struck-through id still excuses the row wherever the marker sits', () => {
    const content = ledger(
      '| ~~**R6**~~ | Medium | OPEN — DATED 2026-10-15 | superseded | Awwal |\n',
    );
    expect(findExpiredDatedResiduals([{ path: 'a.md', content }], TODAY)).toEqual([]);
  });

  /**
   * The property that made whole-row reading tempting is still intact: the marker is not tied to a
   * column NUMBER, so a dated deferral in 13-68's 4-column adjudication ledger (where column 3 is a
   * justification, not a state) is still found — here in column 4.
   */
  it('still finds a marker that is not in the state column', () => {
    const content =
      '# Story X\n\n## Residuals\n\n| # | residual | why not fixed here | reopen trigger |\n|---|---|---|---|\n' +
      '| A9 | the monitor | needs production traffic | OPEN — DATED 2026-10-15 |\n';
    expect(findExpiredDatedResiduals([{ path: 'a.md', content }], TODAY).map((h) => h.residualId))
      .toEqual(['A9']);
  });
});

/**
 * Story 13-45 — refuse `Status: done` while a residual is still OPEN.
 *
 * WHY THIS EXISTS
 * ---------------
 * The residual ledger is this project's memory of what a story did NOT finish. It only works if
 * `done` means done. Story 13-49 alone produced **twenty** residuals in a single session — some
 * closed by evidence, some accepted with an owner, several handed to other stories — and the
 * person closing them was often the same person who opened them. Discipline checked by the
 * discipliner is not a control.
 *
 * The failure this prevents is quiet: a story flips to `done`, the ledger stops being read
 * because the story looks finished, and an OPEN row that blocks a launch decision goes with it.
 * Nothing errors. The work simply stops being visible.
 *
 * WHAT COUNTS AS OPEN
 * -------------------
 * A residual row is a table row whose first cell names an ID (`R1`, `**R13**`, `~~R9~~`). The
 * STATE cell is the third column. A row is open when that cell says OPEN and does not also say
 * CLOSED — because this repo's real ledgers carry compound states like
 * "WRITER FIXED (hotfix) · historical forks PERMANENT" and
 * "CLOSED for the 7 affected · the CLASS is mitigated". Struck-through IDs (`~~R9~~`) are the
 * repo's convention for a resolved row and are skipped.
 *
 * ⚠️ THAT LAST PARAGRAPH USED TO READ "DELIBERATELY NOT A LINT ON PROSE … the ledger is the
 * contract." It was true as written and it was the hole (fixed 2026-08-20). Reading the table ONLY
 * means the guard polices exactly the stories that opted into the format — a story with no ledger
 * has no rows to match and passes whatever it admits in prose. 12-5 was the live repro: `Status:
 * done`, no ledger, an explicit "⛔ PRE-DEPLOY RESIDUAL" in the body, guard green.
 *
 * So it now ALSO flags explicit unresolved-residual language when there is no ledger to carry it —
 * narrowly, because requiring a ledger of every `done` story would flag 204 of 213 and this runs in
 * `pre-commit`. A story that merely DISCUSSES an open question is still not blocked; only the
 * explicit markers are.
 */

export interface ResidualHit {
  storyFile: string;
  residualId: string;
  state: string;
}

/** A story file as read from disk. */
export interface StoryFile {
  path: string;
  content: string;
}

const STATUS_DONE = /^Status:\s*done\s*$/im;

/**
 * First cell shapes we accept as a residual id: R1, **R13**, ~~R9~~, R9-original, A1, R2b.
 *
 * ⛔ WIDENED BY STORY 13-70 (AC7), AND THE WIDTH IS MEASURED, NOT CHOSEN.
 *
 * It was `R\d+…` — `R<digits>` ONLY. 13-68's adjudication ledger numbers its rows `**A1**`,
 * `**A2**`, `**A3**`, and **A1 is the residual Story 13-70 FR1 exists to close**: the guard could
 * not see any of them. Adjudication independently wrote 13-69's ledger with `D1`/`D2` ids the same
 * week and the guard ignored that too (playbook §2ab.1). A ledger whose ids do not conform is
 * strictly WORSE than no ledger, because `HAS_LEDGER` disables the prose fallback for the file.
 *
 * ⚠️ THE OBVIOUS WIDENING — any capital letter, `[A-Z]\d+` — IS WRONG, and it is wrong by a
 * measured amount. Counted over `_bmad-output/implementation-artifacts/*.md` on 2026-09-20:
 *
 *   | id pattern        | rows matched | done-story OPEN hits |
 *   |-------------------|--------------|----------------------|
 *   | `R\d+`  (before)  | 226          | 0                    |
 *   | `[RA]\d+` (now)   | 229          | 0                    |
 *   | `[A-Z]\d+` (naive)| 510          | 2                    |
 *
 * The 284 extra rows `[A-Z]\d+` matches are adversarial-review finding tables — `H1/H2/H3`,
 * `M1…M4`, `L1…L3`, `S3`, `P1…P4`, `C1…C3`, `T1…T5`, `B1/B2` — not residual ledgers. Both of its
 * two extra hits are FALSE POSITIVES, and both are instructive:
 *   • `13-2 M3` — its cell says "the fraud **gate-open** test header", and `\bOPEN\b` matches inside
 *     `gate-open`, because a hyphen is a word boundary.
 *   • `13-37 B10` — a three-column review table whose third cell is a POINTER, not a state:
 *     "`13-46-…md` Context §9, AC9/AC10, the OPEN DECISION block".
 * This guard runs in `pre-commit`. A guard that reds every commit gets disabled, and then it
 * protects nothing — the same argument AC11 makes about dates, one letter at a time.
 *
 * `D` is deliberately EXCLUDED: this guard's own suite uses `| D1 | 140 | OPEN question |` as its
 * worked example of an ordinary table that must NOT be read as a ledger. Ids are `R`; `A` is here
 * because 13-68 already shipped three rows under it and they are the rows AC7 names.
 */
const RESIDUAL_ID = /^\s*~{0,2}\*{0,2}\s*([RA]\d+[A-Za-z0-9-]*)\s*\*{0,2}~{0,2}/;

/* ------------------------------------------------------------------------------------------------
 * Story 13-70 — STOP GUESSING WHAT A RESIDUAL ROW IS FROM ITS ID LETTER.
 *
 * The id pattern was doing two jobs at once: naming the row AND deciding whether the table is a
 * residual ledger at all. That is why it could not be widened safely — every letter added to it
 * also swept in the adversarial-review finding tables (`H1`, `M3`, `B10`, `S3`, `T4`…), which use
 * the same shape and where "OPEN" means something else entirely.
 *
 * So the two jobs are separated. **Inside a section whose heading mentions residuals, ANY short
 * alphabetic id counts** — context has already established that the table is a ledger. **Outside
 * one, the conservative `[RA]\d+` still applies**, so nothing that was policed before stops being
 * policed. That closes both failure modes at once:
 *   • the §2ab.1 hazard — adjudication wrote 13-69's ledger with `D1`/`D2` ids and the guard
 *     silently ignored the whole thing, which is worse than having no ledger because `HAS_LEDGER`
 *     disables the prose fallback;
 *   • the false-positive blast — `[A-Z]\d+` applied everywhere matched 510 rows instead of 229 and
 *     produced two wrong hits in `done` stories (one of them because `\bOPEN\b` matches inside the
 *     phrase "gate-open").
 *
 * ⭐ MEASURED ON THE REAL CORPUS BEFORE SHIPPING, 2026-09-20: **0 new hits, 0 lost hits, 0 rows
 * whose open/closed verdict changes.** It is a pure widening of what the guard can SEE, with no
 * change to what it currently says — which is exactly the shape a guard change should have.
 * ---------------------------------------------------------------------------------------------- */

/** A heading that declares a residual ledger: `## Residuals`, `### Residual Ledger`, `### A5 — Residuals after adjudication`. */
const LEDGER_HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * A ``` or ~~~ fence. ⛔ LINES INSIDE ONE ARE NOT MARKDOWN and must not be parsed as headings.
 *
 * Added by the adversarial review of Story 13-70 (2026-09-20). The section detector above decides
 * what a residual row IS, and it read every line in the file — including the inside of code blocks,
 * where `# something` is a SHELL COMMENT, not a heading. Measured on the real corpus the day it was
 * found: **156 lines inside fenced blocks parse as Markdown headings** (`# Re-run the guard`,
 * `# api — 305 files / 4316 passed`, `# From project root`). Both directions were reproduced:
 *
 *   • a `# comment` at level 1 inside a fence CLOSES an open ledger section, so every residual row
 *     after the fence goes invisible — the §2ab.1 hazard this pass was written to close, arriving
 *     through a different door;
 *   • a fence containing `# Residuals recount` OPENS one, so a following adversarial-review finding
 *     table (`H1`, `M3`, `B10`) is read as a ledger under the loose id pattern — the false-positive
 *     blast the `[A-Z]\d+` measurement rejected.
 *
 * ⭐ MEASURED BEFORE AND AFTER, 2026-09-20: fence-blind and fence-aware agree on **all 250 residual
 * rows in `_bmad-output/implementation-artifacts/*.md` — 0 rows differ**. So this is hardening a
 * latent hole, not fixing a live miss, and it is written down that way
 * [[pattern-a-clean-result-must-prove-it-measured]]. The population that would make it fire is
 * already in the repo and grows with every story that quotes a command.
 */
const FENCE = /^\s*(?:```|~~~)/;

/** Inside a ledger section the id may be any short alphabetic tag: R1, A1, D2, R2b, H3. */
const LEDGER_RESIDUAL_ID = /^\s*~{0,2}\*{0,2}\s*([A-Za-z]{1,3}\d+[A-Za-z0-9-]*)\s*\*{0,2}~{0,2}/;

export interface ResidualRow {
  /** The row's text between its outer pipes. */
  raw: string;
  /** Cells, split on unescaped pipes. */
  parts: string[];
  /** The id as written in the first cell. */
  id: string;
  /** The first cell verbatim, for the `~~struck-through~~` convention. */
  idCell: string;
  /** Was this row inside a section whose heading mentions residuals? */
  inLedger: boolean;
}

/**
 * Every table row in `content` that is a residual row, with its ledger context.
 *
 * Line-by-line rather than one global `matchAll` over the whole file, because the row's SECTION is
 * part of what makes it a residual row and a document-wide regex throws that context away.
 *
 * ⚠️ A row without a TRAILING `|` is still invisible, unchanged from Story 13-45 — this has already
 * cost one session a wrong conclusion, and it is a documented convention, not an accident.
 */
export function residualRows(content: string): ResidualRow[] {
  const out: ResidualRow[] = [];
  let inLedger = false;
  let ledgerLevel = 0;
  let inFence = false;

  for (const line of content.split(/\r?\n/)) {
    // ⛔ See FENCE: inside a code block `# foo` is a shell comment, not a heading, and a `| a | b |`
    // line is sample output, not a ledger row. Neither may move or be read as ledger state.
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = LEDGER_HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      if (/residual/i.test(heading[2] ?? '')) {
        inLedger = true;
        ledgerLevel = level;
      } else if (inLedger && level <= ledgerLevel) {
        inLedger = false;
      }
      continue;
    }

    const row = /^\|(.+)\|\s*$/.exec(line);
    if (!row) continue;

    const raw = row[1] ?? '';
    const parts = cells(raw);
    if (parts.length < 3) continue;

    const idCell = parts[0] ?? '';
    const idMatch = (inLedger ? LEDGER_RESIDUAL_ID : RESIDUAL_ID).exec(idCell);
    if (!idMatch) continue;

    out.push({ raw, parts, id: idMatch[1]!, idCell, inLedger });
  }

  return out;
}

/**
 * Split a table row into cells.
 *
 * ⚠️ Story 13-70: splits on UNESCAPED pipes only. A `\|` inside a cell is Markdown's way of writing
 * a literal pipe — it renders as one character and does NOT start a new column — but a naive
 * `split('|')` treats it as a separator and shifts every column after it. The state cell is the
 * THIRD one, so an escaped pipe in the id or severity cell moves a genuinely OPEN row's state out of
 * view and the guard reports nothing.
 *
 * ⭐ MEASURED BEFORE CHANGING IT, 2026-09-20: **0** residual rows in
 * `_bmad-output/implementation-artifacts/*.md` are judged differently by the two splits. 255 rows do
 * contain an escaped pipe, but in every one of them it falls in the evidence cell — AFTER column 3
 * — so today's verdicts were right by luck, not by construction. This is hardening a latent hole,
 * not fixing a live miss, and it is written down that way [[pattern-a-clean-result-must-prove-it-measured]].
 */
function cells(row: string): string[] {
  return row.split(/(?<!\\)\|/).map((c) => c.trim());
}

/**
 * Is this state cell OPEN?
 *
 * Compound states are the norm here, so "contains OPEN" alone would flag rows that are actually
 * resolved ("CLOSED ... was: OPEN"). Require an open marker and the absence of a closure marker.
 *
 * ⛔ `DISCHARGE-ON-PUSH` / `DISCHARGE-ON-DEPLOY` COUNT AS OPEN — fixed 2026-08-20 at adjudication.
 * This predicate previously required the literal word OPEN, so the two discharge states slipped
 * through silently, even though §2a0 defines them in exactly the terms this guard exists to
 * enforce: *"provable only after deploy. **Blocks `done`**, not the commit."* Live proof at the
 * time of the fix: 13-57 R4 and 13-59 R1/R6 all sat `DISCHARGE-ON-*` inside `Status: done` stories
 * and the guard reported 317 scanned, none open. **The guard did not enforce the one state the
 * standard singles out as blocking.**
 */
const OPEN_MARKER = /\bOPEN\b|\bDISCHARGE-ON-(?:PUSH|DEPLOY)\b/;

export function isOpenState(state: string): boolean {
  const s = state.toUpperCase();
  if (!OPEN_MARKER.test(s)) return false;
  if (s.includes('REOPEN TRIGGER')) return false; // a monitoring note, not a state
  return !(s.includes('CLOSED') || s.includes('✅') || s.includes('RESOLVED') || s.includes('DISCHARGED'));
}

/**
 * Residual language used OUTSIDE any table — the second hole, same session.
 *
 * The row scan can only police stories that opted into the ledger FORMAT: a story with no residual
 * table has no rows to match, so it passes whatever it admits in prose. 12-5 was the live repro —
 * `Status: done`, no ledger, and an explicit "⛔ PRE-DEPLOY RESIDUAL" in its own body, with the
 * guard green. A check that cannot fail for the case it exists to catch is decoration.
 *
 * Deliberately NARROW. Requiring a ledger of every `done` story would flag 204 of 213 and block
 * every commit (the guard runs in `pre-commit`), so this matches only the explicit *unresolved*
 * markers and only when the story has no ledger at all to carry them.
 */
const PROSE_RESIDUAL = /(?:PRE-DEPLOY|UNDISCHARGED|OUTSTANDING)\s+RESIDUAL|DISCHARGE-ON-(?:PUSH|DEPLOY)/i;
const HAS_LEDGER = /^\s*#{2,4}\s+Residuals\b/im;

export function hasProseResidualWithoutLedger(content: string): boolean {
  if (HAS_LEDGER.test(content)) return false;
  return PROSE_RESIDUAL.test(content);
}

/**
 * Find every story marked `done` that still carries an OPEN residual.
 *
 * Returns hits rather than throwing so the caller owns presentation and exit code — the same
 * split as the registry-read drift guard.
 */
export function findDoneStoriesWithOpenResiduals(files: StoryFile[]): ResidualHit[] {
  const hits: ResidualHit[] = [];

  for (const file of files) {
    if (!STATUS_DONE.test(file.content)) continue;

    // Hole 2 (2026-08-20): a story with no ledger has no rows to scan, so prose debt walked
    // straight past. Reported as a synthetic `prose` id so the message can say what to do.
    if (hasProseResidualWithoutLedger(file.content)) {
      hits.push({
        storyFile: file.path,
        residualId: 'prose',
        state: 'residual language in prose, with no ## Residuals ledger to resolve it against',
      });
    }

    for (const row of residualRows(file.content)) {
      // `~~R9~~` is this repo's "this row is resolved" convention.
      if (row.idCell.includes('~~')) continue;

      const state = row.parts[2] ?? '';
      if (isOpenState(state)) {
        hits.push({
          storyFile: file.path,
          residualId: row.id,
          state: state.replace(/\s+/g, ' ').slice(0, 120),
        });
      }
    }
  }

  return hits;
}

export function formatResidualHits(hits: ResidualHit[]): string {
  const byStory = new Map<string, ResidualHit[]>();
  for (const h of hits) {
    const list = byStory.get(h.storyFile) ?? [];
    list.push(h);
    byStory.set(h.storyFile, list);
  }

  const lines: string[] = [];
  for (const [story, rows] of byStory) {
    lines.push(`  ${story}  — Status: done, but ${rows.length} residual(s) still OPEN:`);
    for (const r of rows) lines.push(`      ${r.residualId}  ${r.state}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------------------------------------
 * Story 13-70 FR4 — A DEFERRAL THAT NAMES A DATE FAILS THE BUILD WHEN THAT DATE PASSES.
 *
 * The residual ledger's other failure mode is not `done` with an open row; it is a row that says
 * "we will do this by <date>", nobody reads it again, and the date goes by in silence. 13-68's R2b
 * is the live one: a distinct-identifier cardinality monitor, deferred to 2026-10-15.
 *
 * ⛔ THE CHECK IS OPT-IN, AND THE BLAST RADIUS WAS MEASURED BEFORE IT WAS WRITTEN (AC11).
 * Counted over `_bmad-output/implementation-artifacts/*.md` on 2026-09-20:
 *
 *   | measurement                                             | value |
 *   |---------------------------------------------------------|-------|
 *   | table rows containing ANY date                           | 983 (157 of 328 files) |
 *   | `\bDATED <iso>` markers INSIDE a residual row            | 4 (13-68 R2b; 13-70 R4/R5/R6) |
 *   | `\bDATED <iso>` markers in prose elsewhere               | 14 (13-70's own story text, quoting the marker) |
 *
 * ⚠️ RE-MEASURED BY THE ADVERSARIAL REVIEW IMMEDIATELY BEFORE HAND-OFF, 2026-09-20. It had read
 * *959 / 1 / 5*, taken mid-pass, and the passes that followed added rows to 13-70's own file — so
 * the numbers in this comment did not reproduce against the tree they shipped with, which is the
 * only reason anyone could tell [[pattern-falsifiable-number-is-a-live-artefact]]. ⭐ THE COUNT IS
 * SELF-REFERENTIAL: this corpus contains the stories that record the count, so it moves whenever one
 * is edited. That is why the COMMANDS are recorded and not just the values (A12) — re-run them, do
 * not trust the number. What must stay true is the RATIO: ~983 dated rows against 4 opted-in
 * markers, three orders of magnitude, which is the whole argument for the marker being opt-in.
 *
 * So a naive "parse any date in the row and fail once it is past" reds essentially the whole repo,
 * and a guard that reds everything gets disabled. Almost every date in these files is EVIDENCE —
 * *"measured 2026-09-18"*, *"fixed 2026-08-07"* — not a deadline. Only the explicit marker opts a
 * row in. Same shape as 13-45's own ledger guard, where the broad rule would have flagged 204 of
 * 213 rows and the narrow one flagged 2.
 *
 * ⚠️ THE WORD BOUNDARY IS MANDATORY (AC12). `/DATED 20\d\d-/` matches inside `UPDATED 2026-09-20`,
 * which is a line shape this repo writes constantly; it cost the authoring pass a false finding.
 * `\bDATED\b` does not, because `P` and `D` are both word characters so there is no boundary
 * between them. `story-residual-guard.test.ts` pins both strings in one fixture.
 *
 * ⚠️ IT DELIBERATELY DOES NOT REQUIRE `Status: done`. The done-scan above exists for stories that
 * claim to be finished; an expiring deferral is the opposite case — 13-68 is `Status: review` and
 * has been since 2026-09-16, so a date check gated on `done` could never have fired on the one row
 * in the repo that carries a date. [[pattern-a-gate-opened-onto-a-path-that-cannot-run]]
 * ---------------------------------------------------------------------------------------------- */

/** The opt-in marker, and the only thing that subjects a row to a deadline. */
const DATED_MARKER = /\bDATED\b\s*:?\s*(20\d\d-[01]\d-[0-3]\d)/;

/**
 * This repo's closure vocabulary.
 *
 * ⛔ SCOPED TO THE ID CELL AND THE CELL CARRYING THE MARKER — not the whole row. Fixed by the
 * adversarial review of Story 13-70 (2026-09-20); it shipped reading `row.raw`, i.e. every column.
 *
 * The evidence column in this repo is long prose that routinely mentions how OTHER rows were
 * disposed of, so one of those words landing in it silently switched the deadline off. Reproduced
 * on a row that is genuinely open and genuinely past its date:
 *
 *   | R6 | Medium | OPEN — DATED 2026-10-15 | …the sibling question was RESOLVED in 13-68 | Awwal |
 *     as of 2026-10-16 → 0 expired          ← the deliverable, silently disarmed
 *   …with "RESOLVED" changed to "settled" → 1 expired
 *
 * That is the failure this guard exists to prevent, performed by the guard on itself: the row still
 * reads OPEN, the date still passes, and nothing says a word [[pattern-ship-a-fix-that-never-fires]].
 * The opt-in (`DATED`) and the opt-out (closure) now read the SAME cell, so a row can only be
 * excused by the cell that committed it — which keeps the "a dated deferral can sit in any table"
 * property intact, because neither is tied to a column NUMBER.
 */
const ROW_IS_CLOSED = /\bCLOSED\b|✅|\bRESOLVED\b|\bDISCHARGED\b/;

export interface ExpiredResidualHit {
  storyFile: string;
  residualId: string;
  /** The ISO date the row committed to. */
  dueOn: string;
  /** AC8 — the row's own text, so the operator can act without opening the story file. */
  rowText: string;
}

/**
 * The single injectable clock (4.1d). UTC, from an ISO date string, so the guard cannot change its
 * answer at local midnight and tests never pass `new Date()`.
 */
export function toUtcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Every residual row whose `DATED <iso>` deadline has passed and which is not closed.
 *
 * "Still open" is deliberately NOT `isOpenState(cells[2])` here. The done-scan can rely on column 3
 * being a state cell because the ledger template says so; a dated deferral can sit in any table —
 * 13-68's adjudication ledger is `| # | residual | why not fixed here | reopen trigger |`, where
 * column 3 is a justification, not a state. So the marker is the opt-in and this repo's closure
 * vocabulary is the opt-out — both read from the SAME cell, the one that carries the marker, plus
 * the id cell for the `~~struck~~` / `✅` conventions. ⛔ NOT the whole row: see ROW_IS_CLOSED.
 */
export function findExpiredDatedResiduals(files: StoryFile[], now: Date): ExpiredResidualHit[] {
  const today = toUtcDateKey(now);
  const hits: ExpiredResidualHit[] = [];

  for (const file of files) {
    for (const row of residualRows(file.content)) {
      if (row.idCell.includes('~~')) continue; // the repo's "this row is resolved" convention

      // The cell that CARRIES the marker is the cell that committed to the date, so it is also the
      // only cell that may excuse it. An evidence cell mentioning how another row closed must not.
      const datedCell = row.parts.find((cell) => DATED_MARKER.test(cell));
      if (datedCell === undefined) continue;
      if (ROW_IS_CLOSED.test(`${row.idCell} ${datedCell}`.toUpperCase())) continue;

      const dated = DATED_MARKER.exec(datedCell)!;
      const dueOn = dated[1]!;
      if (today <= dueOn) continue; // not yet due — an undated or future row must never fail

      hits.push({
        storyFile: file.path,
        residualId: row.id,
        dueOn,
        rowText: row.raw.replace(/\s+/g, ' ').trim().slice(0, 400),
      });
    }
  }

  return hits;
}

/**
 * AC8 — the message carries the row's OWN TEXT, not a line number. Whoever hits this at 6pm in a
 * pre-commit hook has to be able to decide what to do without opening the story file.
 */
export function formatExpiredResiduals(hits: ExpiredResidualHit[], now: Date): string {
  const lines: string[] = [];
  for (const h of hits) {
    lines.push(`  ${h.storyFile}  — residual ${h.residualId} was DATED ${h.dueOn}, and today is ${toUtcDateKey(now)} (UTC):`);
    lines.push(`      ${h.rowText}`);
  }
  return lines.join('\n');
}

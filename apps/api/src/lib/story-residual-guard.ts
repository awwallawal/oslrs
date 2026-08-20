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

/** `| **R13** — text | High | **OPEN — ...** | evidence | owner |` */
const TABLE_ROW = /^\|(.+)\|\s*$/gm;

/** First cell shapes we accept as a residual id: R1, **R13**, ~~R9~~, R9-original. */
const RESIDUAL_ID = /^\s*~{0,2}\*{0,2}\s*(R\d+[A-Za-z0-9-]*)\s*\*{0,2}~{0,2}/;

function cells(row: string): string[] {
  return row.split('|').map((c) => c.trim());
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

    for (const match of file.content.matchAll(TABLE_ROW)) {
      const row = match[1] ?? '';
      const parts = cells(row);
      if (parts.length < 3) continue;

      const idCell = parts[0] ?? '';
      const idMatch = RESIDUAL_ID.exec(idCell);
      if (!idMatch) continue;

      // `~~R9~~` is this repo's "this row is resolved" convention.
      if (idCell.includes('~~')) continue;

      const state = parts[2] ?? '';
      if (isOpenState(state)) {
        hits.push({
          storyFile: file.path,
          residualId: idMatch[1]!,
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

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
 * DELIBERATELY NOT A LINT ON PROSE. It reads the ledger table only. A story that discusses an
 * open question in its Dev Notes is not blocked — the ledger is the contract.
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
 * resolved ("CLOSED ... was: OPEN"). Require OPEN and the absence of a closure marker.
 */
export function isOpenState(state: string): boolean {
  const s = state.toUpperCase();
  if (!/\bOPEN\b/.test(s)) return false;
  if (s.includes('REOPEN TRIGGER')) return false; // a monitoring note, not a state
  return !(s.includes('CLOSED') || s.includes('✅') || s.includes('RESOLVED'));
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

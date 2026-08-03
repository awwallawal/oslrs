/**
 * Story 13-49 Task 2 — reading the operator's decisions out of the triage workbook.
 *
 * TWO SOURCES, ONE DIRECTION EACH (AC2):
 *   - the SHEET is the source of truth for the DISPOSITION — what should happen to a person;
 *   - the LIVE `wizard_drafts` table is the source of truth for the DATA — what we know about them.
 *
 * Never the other way round. The snapshot JSON under `docs/vps-snapshots/` is a build
 * input for the workbook, not an input to a write path: by the time this runs it is
 * hours or days old, and adopting from a stale copy would write yesterday's answers over
 * a person's record.
 *
 * FAIL CLOSED. Every validation here throws rather than skipping. On a batch that creates
 * citizen records, a skipped row is worse than a crash: the run reports success, the count
 * is quietly short, and nobody reconciles 289 against 292.
 *
 * The exceljs I/O lives in the script; everything decidable lives here as pure functions so
 * the rules are tested without a file or a database.
 */
import { isDraftDecision, type DraftDecision } from './decisions.js';

/** One row as read off the sheet, before any validation. */
export interface RawDecisionRow {
  /** 1-indexed worksheet row, echoed in errors so the operator can go straight to it. */
  rowNumber: number;
  draftId: string;
  decision: string;
}

/** How many ids to name before clipping, so an error stays readable at 292 rows. */
const MAX_LISTED = 12;

const listIds = (ids: string[]): string =>
  ids.length <= MAX_LISTED
    ? ids.join(', ')
    : `${ids.slice(0, MAX_LISTED).join(', ')} … (+${ids.length - MAX_LISTED} more)`;

/**
 * Validate the sheet and return `draft_id → decision`.
 *
 * Collects ALL problems before throwing. A reader that dies on the first bad cell turns a
 * 292-row review into 292 round trips; the operator should get one list and fix it once.
 */
export function parseDecisionRows(rows: RawDecisionRow[]): Map<string, DraftDecision> {
  const problems: string[] = [];
  const decisions = new Map<string, DraftDecision>();
  const seen = new Map<string, number>();

  for (const r of rows) {
    const draftId = r.draftId.trim();

    if (draftId === '') {
      problems.push(`row ${r.rowNumber}: blank draft_id — a decision with no key cannot be applied`);
      continue;
    }

    const firstSeenAt = seen.get(draftId);
    if (firstSeenAt !== undefined) {
      problems.push(
        `row ${r.rowNumber}: duplicate draft_id ${draftId} (first seen on row ${firstSeenAt}) — ` +
          `two dispositions for one person is not resolvable`,
      );
      continue;
    }
    seen.set(draftId, r.rowNumber);

    // Deliberately EXACT — see `isDraftDecision`. A value that needs normalising to be
    // understood was typed over the dropdown, and guessing which of seven dispositions
    // was meant is not a decision this script gets to make.
    if (!isDraftDecision(r.decision)) {
      const shown = r.decision.trim() === '' ? '(blank)' : JSON.stringify(r.decision);
      problems.push(`row ${r.rowNumber}: DECISION ${shown} is blank or unrecognised`);
      continue;
    }

    decisions.set(draftId, r.decision);
  }

  if (problems.length > 0) {
    throw new Error(
      `Draft triage sheet is not actionable — ${problems.length} row(s) rejected. ` +
        `AC2: a recommendation is not a decision, and this script refuses to guess.\n` +
        problems.map((p) => `  • ${p}`).join('\n'),
    );
  }

  return decisions;
}

/**
 * Assert the sheet and the live table describe the SAME set of drafts.
 *
 * Both directions are fatal, for different reasons:
 *   - an id in the sheet that is not live → the sheet is stale (drafts expired, were
 *     completed, or the extract was rebuilt), so every other row is suspect too;
 *   - a live draft with no row in the sheet → that person is silently left out of a
 *     programme whose entire premise is "every draft adjudicated to a disposition".
 */
export function reconcileDraftIds(sheetIds: Set<string>, liveIds: Set<string>): void {
  const notLive = [...sheetIds].filter((id) => !liveIds.has(id));
  const notJudged = [...liveIds].filter((id) => !sheetIds.has(id));

  if (notLive.length === 0 && notJudged.length === 0) return;

  const parts: string[] = [
    `Draft triage sheet does not reconcile against wizard_drafts ` +
      `(sheet ${sheetIds.size} rows, live ${liveIds.size} drafts).`,
  ];
  if (notLive.length > 0) {
    parts.push(
      `  • ${notLive.length} sheet row(s) reference a draft that is not live — the sheet is ` +
        `stale; regenerate it with \`pnpm --filter @oslsr/api draft:triage\`: ${listIds(notLive)}`,
    );
  }
  if (notJudged.length > 0) {
    parts.push(
      `  • ${notJudged.length} live draft(s) carry no decision — they would be silently left ` +
        `out of the programme: ${listIds(notJudged)}`,
    );
  }
  throw new Error(parts.join('\n'));
}

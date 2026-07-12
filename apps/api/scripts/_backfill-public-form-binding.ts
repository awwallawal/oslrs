/**
 * Story 13-23 (AC4) — idempotent backfill of public submissions that recorded
 * the `no-form-pinned-at-submit` sentinel instead of the pinned form UUID.
 *
 * Root cause (AC1): the server derived `questionnaire_form_id` from the debounced
 * wizard draft, and a `.strict()` draft schema silently 400'd every post-Step-4
 * autosave (it dropped the `prefilledQuestionNames` key Step 4 stamps) — so the
 * form-id stamp never persisted and the whole public channel bound to the
 * sentinel from the day real public regs resumed. AC2/AC3 fix the go-forward
 * path; this script retroactively binds the sentinel rows to the form that was
 * ACTUALLY pinned at each submission's `submitted_at`.
 *
 * "Unambiguously determinable" (AC4): the pin history is reconstructed from the
 * `settings.flipped` audit events for `wizard.public_form_id`. A sentinel row is
 * bound ONLY when:
 *   - a pin event covers its `submitted_at` (a pinned form existed at that time), AND
 *   - the resolved id is a real, currently-existing questionnaire_forms row, AND
 *   - that form's `created_at` <= the submission's `submitted_at` (the form
 *     existed when the row was written — a sanity guard against clock skew).
 * Rows where the pin at that instant is unknown (before the first recorded pin
 * event, or a pin set by a direct DB write with no audit trail) are LEFT as the
 * sentinel and reported — never guessed.
 *
 * Idempotent BY CONSTRUCTION: the UPDATE is guarded `AND questionnaire_form_id =
 * <sentinel>`, so a re-run only ever touches rows still carrying the sentinel.
 *
 * Mirrors the `_backfill-registration-autosends.ts` discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (mandatory first) counts + samples, no writes.
 *   - LIVE requires the deliberately ugly `--confirm-i-am-not-dry-running` flag.
 *
 * Usage:
 *   tsx scripts/_backfill-public-form-binding.ts --dry-run
 *   tsx scripts/_backfill-public-form-binding.ts --apply --confirm-i-am-not-dry-running [--max-rows N]
 *
 * Exit codes: 0 success, 1 on bad args / any per-row write failure.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { PUBLIC_FORM_UNBOUND_SENTINEL } from '../src/utils/questionnaire-form-binding.js';
import pino from 'pino';

const logger = pino({ name: 'public-form-binding-backfill' });

const PIN_SETTING_KEY = 'wizard.public_form_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'help',
]);

const HELP_TEXT = `
Story 13-23 (AC4) — backfill public submissions stamped with the
'${PUBLIC_FORM_UNBOUND_SENTINEL}' sentinel, binding each to the form that was
pinned at its submitted_at (reconstructed from the settings.flipped audit trail).

  --dry-run                          Preview: count + sample resolution, no writes (mandatory first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --max-rows N                       Cap sentinel rows processed this run (default: all).
  --help                             Show this help.

Idempotent: the UPDATE is guarded on the sentinel, so re-runs only touch rows
still unbound. Rows whose pin-at-submit is not unambiguously determinable are
LEFT as the sentinel and reported — never guessed.
`;

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  maxRows: number | null;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Known flags: ${[...KNOWN_FLAGS].join(', ')}`);
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  const maxRowsRaw = flags['max-rows'];
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows: typeof maxRowsRaw === 'string' ? Math.max(1, parseInt(maxRowsRaw, 10)) : null,
  };
}

/** One pin change: the form UUID that became pinned at `at`. */
export interface PinEvent {
  at: Date;
  formId: string;
}

/**
 * Build the pin timeline from raw settings.flipped audit rows for the public
 * form pin, sorted ascending by time.
 *
 * A pin CLEAR (new_value null / non-UUID) is KEPT as a tombstone (`formId=''`),
 * NOT dropped. Story 13-23 (M2): dropping the clear would let
 * {@link resolvePinnedFormAt} carry the PRIOR form forward past the clear and
 * misbind a submission that landed in the cleared window to a form that was not
 * actually pinned then. A tombstone makes that instant resolve to "no pinned
 * form" (null). Only rows with an unparseable timestamp are dropped.
 */
export function buildPinTimeline(
  rows: Array<{ created_at: string | Date; new_value: unknown }>,
): PinEvent[] {
  return rows
    .map((r) => {
      const raw = typeof r.new_value === 'string' ? r.new_value : '';
      return { at: new Date(r.created_at), formId: UUID_RE.test(raw) ? raw : '' };
    })
    .filter((e) => !Number.isNaN(e.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Resolve which form was pinned at instant `at`: the new_value of the latest pin
 * event with `event.at <= at`. Returns null when `at` precedes every recorded
 * pin event, OR when the latest event at-or-before `at` is a clear tombstone
 * (`formId=''`) — in both cases the pin at that time is "no joinable form", so
 * do NOT guess.
 */
export function resolvePinnedFormAt(timeline: PinEvent[], at: Date): string | null {
  let resolved = '';
  for (const e of timeline) {
    if (e.at.getTime() <= at.getTime()) resolved = e.formId;
    else break;
  }
  return resolved ? resolved : null;
}

interface SentinelRow {
  submissionUid: string;
  submittedAt: Date;
  respondentId: string | null;
}

async function fetchPinTimeline(): Promise<PinEvent[]> {
  const result = (await db.execute(sql`
    SELECT created_at, details->>'new_value' AS new_value
    FROM audit_logs
    WHERE action = 'settings.flipped'
      AND details->>'key' = ${PIN_SETTING_KEY}
    ORDER BY created_at ASC
  `)) as { rows: Array<{ created_at: string | Date; new_value: unknown }> };
  return buildPinTimeline(result.rows);
}

async function fetchSentinelRows(maxRows: number | null): Promise<SentinelRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  const result = (await db.execute(sql`
    SELECT submission_uid, submitted_at, respondent_id
    FROM submissions
    WHERE questionnaire_form_id = ${PUBLIC_FORM_UNBOUND_SENTINEL}
      AND source = 'public'
    ORDER BY submitted_at ASC
    ${limitClause}
  `)) as {
    rows: Array<{ submission_uid: string; submitted_at: string | Date; respondent_id: string | null }>;
  };
  return result.rows.map((r) => ({
    submissionUid: r.submission_uid,
    submittedAt: new Date(r.submitted_at),
    respondentId: r.respondent_id,
  }));
}

/** UUIDs of every currently-existing form, with created_at, for the sanity guard. */
async function fetchFormCreatedAt(): Promise<Map<string, Date>> {
  const result = (await db.execute(sql`
    SELECT id, created_at FROM questionnaire_forms
  `)) as { rows: Array<{ id: string; created_at: string | Date }> };
  const map = new Map<string, Date>();
  for (const r of result.rows) map.set(r.id, new Date(r.created_at));
  return map;
}

export type Resolution =
  | { kind: 'bind'; submissionUid: string; formId: string }
  | { kind: 'skip'; submissionUid: string; reason: string };

/**
 * Decide each sentinel row's fate (pure — the unit-tested core). A row binds
 * only when the pin at its submitted_at is known, still exists, and predates the
 * submission; otherwise it is skipped with a reason.
 */
export function resolveRows(
  rows: SentinelRow[],
  timeline: PinEvent[],
  formCreatedAt: Map<string, Date>,
): Resolution[] {
  return rows.map((row) => {
    const pinned = resolvePinnedFormAt(timeline, row.submittedAt);
    if (!pinned) {
      return { kind: 'skip', submissionUid: row.submissionUid, reason: 'no-pin-event-at-submit' };
    }
    const createdAt = formCreatedAt.get(pinned);
    if (!createdAt) {
      return { kind: 'skip', submissionUid: row.submissionUid, reason: 'pinned-form-no-longer-exists' };
    }
    if (createdAt.getTime() > row.submittedAt.getTime()) {
      return { kind: 'skip', submissionUid: row.submissionUid, reason: 'pinned-form-created-after-submit' };
    }
    return { kind: 'bind', submissionUid: row.submissionUid, formId: pinned };
  });
}

async function plan(args: Args): Promise<{ resolutions: Resolution[]; total: number }> {
  const [timeline, rows, formCreatedAt] = await Promise.all([
    fetchPinTimeline(),
    fetchSentinelRows(args.maxRows),
    fetchFormCreatedAt(),
  ]);
  return { resolutions: resolveRows(rows, timeline, formCreatedAt), total: rows.length };
}

function summarise(resolutions: Resolution[]): { binds: number; skips: Map<string, number> } {
  const skips = new Map<string, number>();
  let binds = 0;
  for (const r of resolutions) {
    if (r.kind === 'bind') binds++;
    else skips.set(r.reason, (skips.get(r.reason) ?? 0) + 1);
  }
  return { binds, skips };
}

async function runDryRun(args: Args): Promise<number> {
  const { resolutions, total } = await plan(args);
  const { binds, skips } = summarise(resolutions);
  console.log(`\n[DRY-RUN] ${total} sentinel public submission(s) found.`);
  console.log(`[DRY-RUN] ${binds} would bind; ${total - binds} would be LEFT (undeterminable).`);
  for (const [reason, n] of skips) console.log(`[DRY-RUN]   skip: ${reason} = ${n}`);
  console.log('\n  Sample:');
  for (const r of resolutions.slice(0, 25)) {
    console.log(
      r.kind === 'bind'
        ? `  ${r.submissionUid.slice(0, 8)}… → ${r.formId}`
        : `  ${r.submissionUid.slice(0, 8)}… → LEFT (${r.reason})`,
    );
  }
  if (resolutions.length > 25) console.log(`  … and ${resolutions.length - 25} more.`);
  console.log('\n  PREVIEW only — re-run with --apply --confirm-i-am-not-dry-running to write.\n');
  return 0;
}

async function runApply(args: Args): Promise<number> {
  const live = args.confirmLive;
  const { resolutions, total } = await plan(args);
  const { binds, skips } = summarise(resolutions);
  console.log(`\n[${live ? 'LIVE' : 'PREVIEW'}] total=${total} willBind=${binds} willSkip=${total - binds}`);
  for (const [reason, n] of skips) console.log(`  skip: ${reason} = ${n}`);

  let bound = 0;
  let failed = 0;
  for (const r of resolutions) {
    if (r.kind !== 'bind') continue;
    if (!live) continue;
    try {
      // Idempotent: the sentinel guard means a re-run (or a row already fixed by
      // the go-forward path) is a no-op.
      await db.execute(sql`
        UPDATE submissions
        SET questionnaire_form_id = ${r.formId}
        WHERE submission_uid = ${r.submissionUid}
          AND questionnaire_form_id = ${PUBLIC_FORM_UNBOUND_SENTINEL}
      `);
      bound++;
      logger.info({ event: 'public_form_binding_backfill.bound', submissionUid: r.submissionUid, formId: r.formId });
    } catch (err) {
      failed++;
      logger.error({
        event: 'public_form_binding_backfill.row_failed',
        submissionUid: r.submissionUid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`\nSummary (${live ? 'LIVE' : 'PREVIEW'}): bound=${live ? bound : binds} failed=${failed}\n`);
  if (!live) console.log('  PREVIEW only — re-run with --confirm-i-am-not-dry-running to write.\n');
  return failed > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const args = parseArgs(argv);
  if (args.apply) {
    process.exit(await runApply(args));
  }
  if (!args.dryRun) {
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to write.');
    process.exit(1);
  }
  process.exit(await runDryRun(args));
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'public_form_binding_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}

/**
 * Story 13-49 — the draft-adoption programme (D1–D6).
 *
 * Turns 292 abandoned `wizard_drafts` into registry records, enrichments, invitations or
 * nothing, according to the DECISION column an operator reviewed in
 * `docs/vps-snapshots/draft-triage-2026-08-01.xlsx`.
 *
 *   D1 PUSH_TO_REGISTRY   142 → create respondent + submission, mint the OSLRS number, send
 *   D2 BACKFILL_THE_63     22 → UPDATE one of the Story 9-28 bare records; never re-create
 *   D3 PUSH_PENDING_NIN    20 → create as `pending_nin_capture`, enters the 9-12 ladder day 0
 *   D4 INVITE_TO_RESUME     7 → invitation only, no OSLRS number
 *      EXCLUDE_EMPTY       67 → same cohort: 67 of the 74 have no name at all
 *   D5 EXCLUDE_CONSENT_NO   8 → hard-guarded in code; no write, no contact, ever
 *   D6 ALREADY_REGISTERED  26 → nothing
 *
 * WHY THIS EXISTS: those drafts hold 37 answer keys — names, NINs, occupations, skills,
 * household and business data — for people who consented and then never pressed submit.
 * Blasting first would email 142 of them asking them to register when we already hold their
 * data, and doing nothing deletes it at expiry.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * DRY-RUN DISCIPLINE (AC10, blocking). Preview is the DEFAULT; there is no way to write by
 * omitting a flag. A live run needs BOTH `--apply` and the deliberately ugly
 * `--confirm-i-am-not-dry-running`. The gate is not ceremony: everything in the 2026-07/08
 * sessions that broke, broke on its FIRST REAL EXECUTION, and this is a write path against
 * citizen records.
 *
 *   pnpm --filter @oslsr/api draft:adopt -- --dry-run
 *   pnpm --filter @oslsr/api draft:adopt -- --dry-run --explain <draft_id>
 *   pnpm --filter @oslsr/api draft:adopt -- --apply --confirm-i-am-not-dry-running --max 1
 *   pnpm --filter @oslsr/api draft:adopt -- --apply --confirm-i-am-not-dry-running
 *
 * ROLLBACK (AC11). Every row this programme creates or updates carries
 * `metadata.adopted_by = '13-49'`, which is also the marker 13-44's adoption panel reads —
 * so the panel and the rollback agree by construction. To find everything it touched:
 *
 *   SELECT id, reference_code, status, metadata->>'adopted_at', metadata->>'adopted_from_draft_id'
 *     FROM respondents WHERE metadata->>'adopted_by' = '13-49';
 *   SELECT id, submission_uid FROM submissions WHERE raw_data->>'_adopted_by' = '13-49';
 *
 * Exit codes: 0 success (live or dry), 1 on bad args / prerequisite failure / any row failure.
 */
import os from 'node:os';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import pino from 'pino';
import { db } from '../src/db/index.js';
import { respondents, wizardDrafts } from '../src/db/schema/index.js';
import type { WizardDraftData } from '../src/db/schema/wizard-drafts.js';
import { EmailService } from '../src/services/email.service.js';
import { MagicLinkService } from '../src/services/magic-link.service.js';
// The pin lives in `lib/settings`, which is what `native-form.service.ts:423` reads when it
// resolves the SAME `wizard.public_form_id` for the public wizard — one source, no drift.
import { getSetting } from '../src/lib/settings.js';
import { filterMarketingCohort } from '../src/services/campaign-contact.service.js';
// The adopted-person message set lives in the service layer (type-checked category literals,
// and suppression applied where the other auto-sends apply it) — see `draft-adoption/send.ts`.
import { sendAdoptionMessages } from '../src/services/draft-adoption/send.js';
import { cohortOf, type DraftCohort, type DraftDecision, isDraftDecision, DRAFT_DECISIONS,
} from '../src/services/draft-adoption/decisions.js';
import { parseDecisionRows, reconcileDraftIds, type RawDecisionRow } from '../src/services/draft-adoption/sheet.js';
import {
  adoptDraft,
  computeEnrichmentFill,
  enrichExistingRespondent,
} from '../src/services/draft-adoption/adopt.js';
import {
  ADOPTION_MARKER,
  DraftRowError,
  assertConsentActionable,
  assertNotConsentRefused,
  resolveDraftIdentity,
  buildAdoptionRawData,
  type DraftRow,
} from '../src/services/draft-adoption/payload.js';
// AC14 — the free NIN promotions. Same drafts, same operator, different write: nothing is
// created, one column is filled and one status advances. See the module docblock.
import {
  classifyNinPromotion,
  pairDraftsToPendingRespondents,
  promoteRespondentNin,
} from '../src/services/draft-adoption/promote-nin.js';
import { INVITE_CAMPAIGN_ID, buildInvitationEmail } from '../src/services/draft-adoption/messages.js';

const logger = pino({ name: 'draft-adoption' });

const DEFAULT_SHEET = resolve(
  process.cwd(),
  '../../docs/vps-snapshots/draft-triage-2026-08-01.xlsx',
);

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max',
  'rate-per-minute',
  'sheet',
  'explain',
  'promote-nins',
  'only',
  'help',
]);

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  max: number | null;
  ratePerMinute: number;
  sheetPath: string;
  explainDraftId: string | null;
  /** AC14 — run the free NIN promotions instead of the adoption programme. */
  promoteNins: boolean;
  /**
   * Restrict this run to one or more DECISION values (comma-separated). Null = every decision.
   *
   * WHY THIS EXISTS. The ramp is sequenced by cohort — D2's 16 enrichments, then D3's 24, then
   * D1's 139 in tranches — and `--max` cannot express that: it caps rows ACTED ON in sheet
   * order, and `writePlans` interleaves D1/D3/D2, so `--max 16` acts on a MIX. Before this flag
   * the only way to isolate a cohort was to hand-doctor a copy of the workbook, setting every
   * other row to an inert decision. That works (the error direction is strictly less action)
   * but it leaves a file on disk that LOOKS like the triage sheet and is not — and picking the
   * inert value is itself a trap: `INVITE_TO_RESUME` and `EXCLUDE_EMPTY` share the contact
   * cohort, so choosing either would have MAILED 200+ people instead of doing nothing.
   */
  only: ReadonlySet<DraftDecision> | null;
  help: boolean;
}

/**
 * Parse + validate. Unknown flags are FATAL (typo defence): `--dry-rn` silently doing a live
 * run is the failure this costs nothing to prevent.
 */
export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    // A bare `--` is the standard argument separator and pnpm forwards it verbatim
    // (`pnpm draft:adopt -- --dry-run` arrives as ['--', '--dry-run']). Skipping it is not a
    // hole in the typo defence below: `--` is unambiguous, and rejecting it produced the
    // baffling "Unknown flag --" on the very first real invocation of this script.
    if (arg === '--') continue;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Run with --help for the supported list.`);
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  const rateRaw = flags['rate-per-minute'];
  const ratePerMinute = typeof rateRaw === 'string' ? Number(rateRaw) : 10;
  if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
    throw new Error(`--rate-per-minute must be a positive number (got ${String(rateRaw)})`);
  }

  const maxRaw = flags.max;
  let max: number | null = null;
  if (typeof maxRaw === 'string') {
    max = Number(maxRaw);
    if (!Number.isInteger(max) || max <= 0) {
      throw new Error(`--max must be a positive integer (got ${maxRaw})`);
    }
  }

  const sheetRaw = flags.sheet;
  const explainRaw = flags.explain;

  const dryRun = flags['dry-run'] === true;
  const apply = flags.apply === true;

  /**
   * ⚠️ ADDED BY CODE REVIEW 2026-08-02. `--dry-run` was parsed into `Args` and then read by
   * NOTHING, so `--dry-run --apply --confirm-i-am-not-dry-running` WROTE AND SENT. On an AC10
   * gate whose entire premise is "preview unless proven otherwise", the one flag an operator
   * adds for safety was inert.
   *
   * Rejected outright rather than silently downgraded to a preview: the two flags express
   * opposite intentions, and on a write path against citizen records the right answer to "I
   * cannot tell what you meant" is to stop and make the operator say it again.
   */
  if (dryRun && apply) {
    throw new Error(
      '--dry-run and --apply are contradictory. Pass ONE: --dry-run to preview, or ' +
        '--apply --confirm-i-am-not-dry-running to write.',
    );
  }

  const onlyRaw = flags.only;
  let only: ReadonlySet<DraftDecision> | null = null;
  if (typeof onlyRaw === 'string') {
    const wanted = onlyRaw.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
    const bad = wanted.filter((v) => !isDraftDecision(v));
    if (bad.length > 0) {
      throw new Error(
        `--only got unrecognised decision(s): ${bad.join(', ')}. Valid: ${DRAFT_DECISIONS.join(', ')}`,
      );
    }
    if (wanted.length === 0) throw new Error('--only was passed with no decision value');
    only = new Set(wanted as DraftDecision[]);
  } else if (onlyRaw === true) {
    throw new Error('--only needs a value, e.g. --only BACKFILL_THE_63');
  }

  return {
    dryRun,
    apply,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    max,
    ratePerMinute,
    sheetPath: typeof sheetRaw === 'string' ? sheetRaw : DEFAULT_SHEET,
    explainDraftId: typeof explainRaw === 'string' ? explainRaw : null,
    promoteNins: flags['promote-nins'] === true,
    only,
    help: flags.help === true,
  };
}

/**
 * PREVIEW UNLESS PROVEN OTHERWISE (AC10).
 *
 * Both flags are required, and the default with no flags at all is a preview. `--apply`
 * alone is deliberately NOT enough: it is the flag someone reaches for while exploring, and
 * on this path exploring must not write.
 */
export const isLiveRun = (args: Args): boolean => args.apply && args.confirmLive && !args.dryRun;

export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const head = email.slice(0, Math.min(4, at));
  return `${head}${'*'.repeat(Math.max(0, at - head.length))}${email.slice(at)}`;
};

/**
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — the masking was inconsistent. `maskEmail` hid the
 * address and then `printExplain` printed the NIN and phone of the same person in the clear,
 * two lines below it. One policy: enough tail to recognise the record you asked about, never
 * enough to re-key the identifier off a terminal, a scrollback or a pasted screenshot.
 */
export const maskNin = (nin: string): string =>
  nin === '' ? '(none)' : `${'*'.repeat(Math.max(0, nin.length - 3))}${nin.slice(-3)}`;

export const maskPhone = (phone: string): string =>
  phone === '' ? '(none)' : `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;

const HELP_TEXT = `
Story 13-49 — draft-adoption programme (D1–D6).

  --dry-run                        Preview: per-cohort counts + planned mutations. Default.
  --explain <draft_id>             Print the EXACT mutations for one named record (AC10).
  --apply                          Switch to apply mode (still a preview without the next flag).
  --confirm-i-am-not-dry-running   Required with --apply to actually write and send.
  --max N                          Cap rows ACTED ON this run (use --max 1 for the AC10 gate).
                                   NOT per-cohort: writes run before invites, so --max 5 is
                                   five rows total, not five of each.
  --rate-per-minute N              Send cap (default 10) — a cap, not a target.
  --sheet <path>                   Override the triage workbook path.
  --promote-nins                   AC14 mode: promote nin_unavailable respondents whose NIN is
                                   already sitting in their own draft. No outreach, no sheet.
  --only D1,D2,...                 Restrict the run to one or more DECISION values, e.g.
                                   --only BACKFILL_THE_63 or --only PUSH_TO_REGISTRY,PUSH_PENDING_NIN.
                                   The cohort tally still prints the WHOLE sheet, then states
                                   what is in scope. Use this to sequence the ramp by cohort —
                                   --max cannot, because it caps rows in sheet order and the
                                   write loop interleaves D1/D3/D2.
  --help                           Show this help.

--dry-run and --apply are mutually exclusive and passing both is an error, not a preview.

The DECISION column is the instruction; the live wizard_drafts row is the data. Any blank or
unrecognised decision aborts the run before anything is written (AC2). Consent is refused in
code whatever the sheet says (AC7): adoption needs an explicit "yes", and an explicit "no"
blocks CONTACT as well — including the D4 invitation.
`;

/** Read the workbook's DECISION + draft_id columns. Column positions come from the writer. */
export async function loadDecisionSheet(path: string): Promise<RawDecisionRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('Draft triage');
  if (!ws) throw new Error(`Worksheet "Draft triage" not found in ${path}`);

  const header = ws.getRow(1).values as unknown[];
  const decisionCol = header.findIndex((h) => String(h ?? '').trim() === 'DECISION');
  const draftIdCol = header.findIndex((h) => String(h ?? '').trim() === 'draft_id');
  if (decisionCol < 1 || draftIdCol < 1) {
    throw new Error(
      `Sheet is missing a DECISION and/or draft_id column — is ${path} the triage workbook? ` +
        `Rebuild it with \`pnpm --filter @oslsr/api draft:triage\`.`,
    );
  }

  const rows: RawDecisionRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push({
      rowNumber,
      draftId: String(row.getCell(draftIdCol).value ?? ''),
      decision: String(row.getCell(decisionCol).value ?? ''),
    });
  });
  return rows;
}

interface Plan {
  draft: DraftRow;
  decision: DraftDecision;
  cohort: DraftCohort;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** AC12 — the counts, emitted as one structured event 13-44 and 13-42 can consume. */
interface Counters {
  adopted: number;
  adoptedPendingNin: number;
  enriched: number;
  invited: number;
  excludedConsent: number;
  ignoredAlreadyRegistered: number;
  suppressedSkipped: number;
  recentlyContactedSkipped: number;
  /** Rows this programme had already completed — left untouched, nothing re-sent. */
  alreadyDoneSkipped: number;
  /**
   * ⚠️ ADDED BY CODE REVIEW 2026-08-02. Drafts sharing an email are dropped by
   * `filterMarketingCohort`'s intra-run dedupe; the count was being discarded, so they vanished
   * from the invite with no line in the results.
   */
  duplicateEmailSkipped: number;
  /**
   * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — THE SILENT FAILURE. A row can be adopted and then not
   * contacted (no reference code came back). That branch incremented nothing and logged nothing,
   * so a run printed `adopted: 142` while N of those people held a registry record nobody had
   * told them about — the exact outcome `draft-adoption/send.ts` says must not be fail-soft, and
   * a breach of Task 7.2's own rule that a silent zero is indistinguishable from a bug.
   * A non-zero value here makes the run exit 1.
   */
  adoptedNotTold: number;
  /** AC7 on the CONTACT path — invitations refused because the live draft says `no`. */
  inviteRefusedConsent: number;
  failed: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const live = isLiveRun(args);
  const adoptedAt = new Date();

  console.log(`\n${'='.repeat(78)}`);
  console.log(`Story 13-49 — draft-adoption programme  [${live ? '🔴 LIVE' : '🟢 PREVIEW'}]`);
  console.log(`host ${os.hostname()}  sheet ${args.sheetPath}`);
  if (args.apply && !args.confirmLive) {
    console.log('⚠️  --apply given WITHOUT --confirm-i-am-not-dry-running → still a preview.');
  }
  console.log('='.repeat(78));

  if (args.promoteNins) {
    await runNinPromotions(live, args.max);
    return;
  }

  // ── 1. The instruction: the operator's reviewed DECISION column (AC2) ──────────────────
  const sheetRows = await loadDecisionSheet(args.sheetPath);
  const decisions = parseDecisionRows(sheetRows); // throws on blank / unrecognised / duplicate

  // ── 2. The data: the LIVE drafts, never the snapshot JSON ─────────────────────────────
  const drafts = await db
    .select({
      id: wizardDrafts.id,
      email: wizardDrafts.email,
      formData: wizardDrafts.formData,
    })
    .from(wizardDrafts);

  reconcileDraftIds(new Set(decisions.keys()), new Set(drafts.map((d) => d.id)));

  const byId = new Map(drafts.map((d) => [d.id, d as DraftRow]));
  const plans: Plan[] = [...decisions.entries()].map(([draftId, decision]) => ({
    draft: byId.get(draftId)!,
    decision,
    cohort: cohortOf(decision),
  }));

  // ── 3. Per-cohort counts, always printed — for a preview AND a live run ────────────────
  const tally = new Map<DraftDecision, number>();
  for (const p of plans) tally.set(p.decision, (tally.get(p.decision) ?? 0) + 1);
  console.log('\nCohorts (from the sheet):');
  for (const [decision, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${cohortOf(decision)}  ${decision}`);
  }
  console.log(`  ${String(plans.length).padStart(4)}  TOTAL`);

  // ── 3b. --only: narrow the run to named cohorts, AFTER printing the whole sheet ─────────
  //
  // The tally above always reflects the FULL sheet, so a filtered run can never be mistaken
  // for a complete one: you see what exists, then you see what this run will touch. Rows
  // outside the filter are dropped from `plans` entirely, so they are neither validated nor
  // acted on — they simply are not part of this run.
  if (args.only) {
    const wanted = args.only;
    const before = plans.length;
    const kept = plans.filter((p) => wanted.has(p.decision));
    plans.length = 0;
    plans.push(...kept);
    console.log(`
--only ${[...wanted].join(', ')} → ${plans.length} of ${before} row(s) in scope.`);
    if (plans.length === 0) {
      console.log('Nothing matches the filter. Nothing to do.');
      return;
    }
  }

  // ── 4. Validate EVERY acting row before writing ANY of them (AC2 fail-closed) ──────────
  //
  // ⚠️ WIDENED BY CODE REVIEW 2026-08-02. This loop validated only the two ADOPTING decisions,
  // so all 22 `BACKFILL_THE_63` rows went unexamined until the live run — a D2 row with blank
  // consent, or one resolving to no respondent, surfaced only AFTER earlier rows had already
  // been written. Both of its checks are read-only, so there was never a reason to defer them.
  // The D4 consent check joins them for the same reason: a refusal must be knowable in preview.
  const rowErrors: string[] = [];
  for (const p of plans) {
    try {
      if (p.decision === 'PUSH_TO_REGISTRY' || p.decision === 'PUSH_PENDING_NIN') {
        buildAdoptionRawData({ draft: p.draft, decision: p.decision, adoptedAt });
      } else if (p.decision === 'BACKFILL_THE_63') {
        assertConsentActionable(p.draft);
        await resolveExistingRespondentId(p.draft);
      } else if (p.decision === 'INVITE_TO_RESUME' || p.decision === 'EXCLUDE_EMPTY') {
        // AC7's CONTACT half — an explicit `no` blocks the invitation too (blank does not:
        // a D4 row is by definition a registration where consent was never reached).
        assertNotConsentRefused(p.draft);
      }
    } catch (e) {
      rowErrors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (rowErrors.length > 0) {
    console.log(`\n❌ ${rowErrors.length} row(s) cannot be adopted as marked:`);
    for (const m of rowErrors.slice(0, 20)) console.log(`   • ${m}`);
    if (rowErrors.length > 20) console.log(`   … (+${rowErrors.length - 20} more)`);
    console.log(
      '\nFix the DECISION column for these rows (or the underlying draft) and re-run.\n' +
        'Nothing has been written.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    '\n✅ Every acting row validates — adoptions (consent, identity, NIN shape, NIN-vs-decision),\n' +
      '   enrichments (consent + the target respondent resolves), invitations (consent ≠ no).',
  );

  // ── 5. AC10 — the exact mutations for ONE named record ────────────────────────────────
  const explainTarget =
    args.explainDraftId ??
    plans.find((p) => p.decision === 'PUSH_TO_REGISTRY')?.draft.id ??
    null;
  if (explainTarget) {
    const p = plans.find((x) => x.draft.id === explainTarget);
    if (!p) {
      console.log(`\n⚠️  --explain ${explainTarget}: no such draft in the sheet.`);
    } else {
      await printExplain(p, adoptedAt);
    }
  }

  if (!live) {
    console.log(
      '\n🟢 PREVIEW COMPLETE — nothing written, nothing sent.\n' +
        '   Next (AC10 gate): --apply --confirm-i-am-not-dry-running --max 1\n',
    );
    return;
  }

  // ── 6. LIVE ───────────────────────────────────────────────────────────────────────────
  if (!EmailService.isEnabled()) {
    console.log('\n❌ EmailService is disabled — a live run must be able to send. Aborting.');
    process.exitCode = 1;
    return;
  }

  const counters: Counters = {
    adopted: 0,
    adoptedPendingNin: 0,
    enriched: 0,
    invited: 0,
    excludedConsent: 0,
    ignoredAlreadyRegistered: 0,
    suppressedSkipped: 0,
    recentlyContactedSkipped: 0,
    duplicateEmailSkipped: 0,
    adoptedNotTold: 0,
    inviteRefusedConsent: 0,
    alreadyDoneSkipped: 0,
    failed: 0,
  };

  const formId = await getSetting<string | null>('wizard.public_form_id');
  if (!formId) {
    console.log('\n❌ `wizard.public_form_id` is not set — adoption has no form to bind to.');
    process.exitCode = 1;
    return;
  }

  const delayMs = Math.ceil(60_000 / args.ratePerMinute);

  // 6a. D5 + D6 — counted explicitly. A silent zero is indistinguishable from a bug.
  counters.excludedConsent = plans.filter((p) => p.decision === 'EXCLUDE_CONSENT_NO').length;
  counters.ignoredAlreadyRegistered = plans.filter((p) => p.decision === 'ALREADY_REGISTERED').length;

  // 6b. Adoptions + enrichments. Suppression applies (a bounced address must not be retried);
  //     the 5-day marketing gap deliberately does NOT — a record-confirmation is transactional.
  const writePlans = plans.filter(
    (p) =>
      p.decision === 'PUSH_TO_REGISTRY' ||
      p.decision === 'PUSH_PENDING_NIN' ||
      p.decision === 'BACKFILL_THE_63',
  );

  let acted = 0;
  for (const p of writePlans) {
    if (args.max !== null && acted >= args.max) break;
    acted++;
    try {
      if (p.decision === 'BACKFILL_THE_63') {
        const respondentId = await resolveExistingRespondentId(p.draft);
        const result = await enrichExistingRespondent({
          draft: p.draft,
          respondentId,
          adoptedAt,
        });
        // Already enriched by a previous run: not acted on, not counted as work, NOT re-sent.
        // `acted` is rolled back so the row does not consume an --max slot it never used.
        if (result.alreadyDone) {
          counters.alreadyDoneSkipped++;
          acted--;
          logger.info({ event: 'draft_adoption.enrich_skipped_already_done', draftId: p.draft.id });
          continue;
        }
        counters.enriched++;
        logger.info({ event: 'draft_adoption.enriched', draftId: p.draft.id, filled: result.filled });

        /**
         * ⚠️ ADDED BY CODE REVIEW 2026-08-02. This branch used to `continue` here, so all 22 D2
         * people were enriched in silence — even though Dev Notes heads the confirmation copy
         * "Adopted (D1/D2/D3)" and AC9 says "per adopted person". They get the SAME message as
         * D1/D3, carrying the reference code Story 9-28 already issued them (never a new one,
         * per AC4), because the thing that changed for them is the same thing: their entry is
         * now complete. `sendRegistrationAutoEmails` inside is idempotent — the 13-12 thank-you
         * self-gates on its own send-once marker, so an already-thanked person is not thanked
         * twice.
         */
        await deliverAdoptionMessages({
          counters,
          draft: p.draft,
          respondentId,
          email: p.draft.email,
          referenceCode: result.referenceCode,
          delayMs,
        });
        continue;
      }

      const result = await adoptDraft({
        draft: p.draft,
        decision: p.decision,
        questionnaireFormId: formId,
        adoptedAt,
      });
      // Already adopted by a previous run: nothing written, nothing sent, no --max slot used.
      // Without this a re-run of a D3 sheet mints a SECOND respondent — NIN dedupe cannot see
      // these rows because they have no NIN.
      if (result.alreadyDone) {
        counters.alreadyDoneSkipped++;
        acted--;
        logger.info({ event: 'draft_adoption.adopt_skipped_already_done', draftId: p.draft.id });
        continue;
      }
      if (p.decision === 'PUSH_PENDING_NIN') counters.adoptedPendingNin++;
      else counters.adopted++;

      logger.info({
        event: 'draft_adoption.adopted',
        draftId: p.draft.id,
        respondentId: result.respondentId,
        referenceCode: result.referenceCode,
        pendingNin: p.decision === 'PUSH_PENDING_NIN',
      });

      // AC9 — the message set (confirmation carrying the OSLRS number, then the 13-12
      // thank-you/referral). Transactional, so suppression applies but the 5-day marketing
      // gap deliberately does not — see `draft-adoption/send.ts`.
      await deliverAdoptionMessages({
        counters,
        pendingNin: p.decision === 'PUSH_PENDING_NIN',
        draft: p.draft,
        respondentId: result.respondentId,
        email: result.email,
        referenceCode: result.referenceCode,
        delayMs,
      });
    } catch (e) {
      counters.failed++;
      const message = e instanceof DraftRowError ? e.message : `draft ${p.draft.id}: ${String(e)}`;
      logger.error({ event: 'draft_adoption.row_failed', draftId: p.draft.id, error: message });
      console.log(`   ❌ ${message}`);
    }
  }

  // 6c. D4 invitations — marketing, so they inherit the SHARED cohort filter (suppression +
  //     5-day contact gap + intra-run dedupe) exactly like every other marketing cohort.
  const invitePlans = plans.filter(
    (p) => p.decision === 'INVITE_TO_RESUME' || p.decision === 'EXCLUDE_EMPTY',
  );
  const filtered = await filterMarketingCohort(invitePlans, (p) => p.draft.email);
  counters.suppressedSkipped += filtered.suppressedSkipped;
  counters.recentlyContactedSkipped = filtered.recentlyContactedSkipped;
  counters.duplicateEmailSkipped = filtered.duplicatesSkipped;

  for (const p of filtered.cohort) {
    if (args.max !== null && acted >= args.max) break;
    acted++;
    try {
      /**
       * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — AC7's CONTACT half, which this loop never had.
       * The guard lived only at the two WRITE call sites, so re-marking one of the 8
       * `consent_basic = no` drafts as INVITE_TO_RESUME in the sheet would have mailed a person
       * who had explicitly said no. The pre-flight above already refuses the whole run over
       * this; the second check is here because the pre-flight is a list and this is the line
       * that actually sends. R3's lesson: a sheet is editable, a guard is not.
       */
      assertNotConsentRefused(p.draft);

      const issued = await MagicLinkService.issueToken({
        email: p.draft.email,
        purpose: 'wizard_resume',
      });
      const resumeUrl = MagicLinkService.buildMagicLinkUrl(issued.tokenPlaintext, 'wizard_resume');
      const { firstName } = resolveDraftIdentity(p.draft);
      const mail = buildInvitationEmail({ firstName, resumeUrl });
      const sent = await EmailService.sendGenericEmail(
        { to: p.draft.email, ...mail },
        'reengagement-blast',
        INVITE_CAMPAIGN_ID,
      );
      if (!sent.success) throw new Error(sent.error ?? 'send failed');
      counters.invited++;
      logger.info({ event: 'draft_adoption.invited', draftId: p.draft.id, email: maskEmail(p.draft.email) });
      await sleep(delayMs);
    } catch (e) {
      if (e instanceof DraftRowError && /consent/i.test(e.message)) {
        counters.inviteRefusedConsent++;
        logger.warn({ event: 'draft_adoption.invite_refused_consent', draftId: p.draft.id });
        console.log(`   ⛔ invite refused (consent = no): ${maskEmail(p.draft.email)}`);
        continue;
      }
      counters.failed++;
      logger.error({ event: 'draft_adoption.invite_failed', draftId: p.draft.id, error: String(e) });
      console.log(`   ❌ invite ${maskEmail(p.draft.email)}: ${String(e)}`);
    }
  }

  // ── 7. AC12 — one structured event carrying every count ────────────────────────────────
  logger.info({ event: 'draft_adoption.run_complete', marker: ADOPTION_MARKER, ...counters });
  console.log('\nResults:');
  for (const [k, v] of Object.entries(counters)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log(
    `\nRollback handle: metadata->>'adopted_by' = '${ADOPTION_MARKER}'\n`,
  );
  if (counters.adoptedNotTold > 0) {
    console.log(
      `⚠️  ${counters.adoptedNotTold} person(s) were ADOPTED BUT NOT TOLD — they hold a registry\n` +
        `   record and have received no message. Find them with:\n` +
        `     SELECT id, reference_code FROM respondents\n` +
        `      WHERE metadata->>'adopted_by' = '${ADOPTION_MARKER}' AND reference_code IS NULL;\n`,
    );
  }
  // An adoption nobody was told about is a failure of AC9, not a footnote — it exits non-zero
  // for the same reason a row failure does.
  if (counters.failed > 0 || counters.adoptedNotTold > 0) process.exitCode = 1;
}

/**
 * AC9's message set, and the ONE place its outcomes are counted.
 *
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02. The call site used to read:
 *
 *     if (outcome.sent) await sleep(delayMs);
 *     else if (outcome.reason === 'suppressed') counters.suppressedSkipped++;
 *
 * — so `no_reference_code` fell through to NOTHING. No counter, no log, no console line. A run
 * could print `adopted: 142` while N of those people held a registry record nobody had told
 * them about: adopted, counted, and silent. That is the outcome this entire story exists to
 * avoid, and it is the [[pattern-ship-a-fix-that-never-fires]] shape — a message path that
 * reports success by not reporting anything.
 *
 * Every branch now terminates in a counter. Shared by D1/D3 (adopt) and D2 (enrich) so the two
 * cannot drift.
 */
async function deliverAdoptionMessages(args: {
  counters: Counters;
  draft: DraftRow;
  respondentId: string;
  email: string;
  referenceCode: string | null;
  delayMs: number;
  /** D3 rows get the pending-NIN copy; see AdoptionConfirmationArgs.pendingNin. */
  pendingNin: boolean;
}): Promise<void> {
  const { counters, draft, respondentId, email, referenceCode, delayMs, pendingNin } = args;

  const outcome = await sendAdoptionMessages({
    respondentId,
    email,
    firstName: resolveDraftIdentity(draft).firstName,
    referenceCode,
    pendingNin,
  });

  if (outcome.sent) {
    await sleep(delayMs);
    return;
  }

  if (outcome.reason === 'suppressed') {
    counters.suppressedSkipped++;
    logger.warn({
      event: 'draft_adoption.not_told_suppressed',
      draftId: draft.id,
      respondentId,
      note: 'address is on the suppression list — adopted, not contacted',
    });
    console.log(`   ⚠️  adopted but suppressed (not told): ${maskEmail(email)}`);
    return;
  }

  counters.adoptedNotTold++;
  logger.error({
    event: 'draft_adoption.adopted_but_not_told',
    draftId: draft.id,
    respondentId,
    reason: outcome.reason,
    note: 'record exists, no reference code came back, so no confirmation could be sent',
  });
  console.log(
    `   ❌ ADOPTED BUT NOT TOLD (${outcome.reason}): respondent ${respondentId} — ` +
      `no OSLRS number to send. Investigate before the batch continues.`,
  );
}

/** AC10 — show precisely what one record would become, without writing it. */
async function printExplain(p: Plan, adoptedAt: Date): Promise<void> {
  const id = resolveDraftIdentity(p.draft);
  console.log(`\n${'─'.repeat(78)}`);
  console.log(`EXACT MUTATIONS for draft ${p.draft.id}  [${p.cohort} ${p.decision}]`);
  console.log('─'.repeat(78));
  console.log(`  contact         ${maskEmail(p.draft.email)}`);
  console.log(`  name            ${id.firstName} ${id.surname}`);
  console.log(`  nin             ${id.nin ? maskNin(id.nin) : '(none — pending-NIN adoption)'}`);
  console.log(`  lga / phone     ${id.lgaId} / ${maskPhone(id.phone)}`);
  console.log(`  consent_basic   ${id.consentBasic || '(blank)'}`);
  console.log(`  answers carried ${id.answerCount} keys`);

  if (p.decision === 'BACKFILL_THE_63') {
    // ⚠️ WIDENED BY CODE REVIEW 2026-08-02. This branch printed a generic blurb — "blank
    // identity columns filled from the draft" — which is a description of the ALGORITHM, not
    // of this record's mutation, and `EnrichResult.filled` was documented as "reported in the
    // dry-run" while the dry-run never reached it. Now it resolves the target and names the
    // exact columns, so "enriched" stops being a claim and becomes a preview.
    console.log('\n  UPDATE respondents   (the existing record — no INSERT, no new reference code)');
    try {
      const respondentId = await resolveExistingRespondentId(p.draft);
      const existing = await db.query.respondents.findFirst({
        where: eq(respondents.id, respondentId),
      });
      const { filled } = computeEnrichmentFill(
        (existing ?? {}) as Record<string, unknown>,
        id,
      );
      console.log(`    target          ${existing?.referenceCode ?? respondentId} (unchanged)`);
      console.log(
        `    columns filled  ${filled.length > 0 ? filled.join(', ') : '(none — every column is already populated)'}`,
      );
    } catch (e) {
      console.log(`    ⚠️  ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log(`    metadata.adopted_by = '${ADOPTION_MARKER}'`);
    console.log('    + metadata.adopted_draft_answers = <all answer keys>');
    console.log('  SEND  adoption confirmation (their EXISTING OSLRS number) + 13-12 thank-you');
    return;
  }

  const raw = buildAdoptionRawData({ draft: p.draft, decision: p.decision, adoptedAt });
  console.log('\n  INSERT submissions   (processed:false → SubmissionProcessingService)');
  console.log(`    raw_data keys: ${Object.keys(raw).length}`);
  console.log(`    nin key present: ${'nin' in raw}`);
  console.log(`    _pendingNin: ${raw._pendingNin === true}`);
  console.log('  → creates respondent, mints reference code, status: ' +
    (p.decision === 'PUSH_PENDING_NIN' ? 'pending_nin_capture (enters the 9-12 ladder)' : 'active'));
  console.log('  UPDATE submissions   re-attach email (so /check-registration resolves them)');
  console.log(`  UPDATE respondents   metadata.adopted_by = '${ADOPTION_MARKER}'`);
  console.log('  SEND  adoption confirmation (OSLRS number + review/update link)');
  console.log('  SEND  13-12 thank-you / referral');
}

/**
 * AC14 — promote `nin_unavailable` respondents whose NIN is already in their own draft.
 *
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02: AC14 shipped in nothing. It is a separate MODE rather
 * than a step of the programme because it neither reads the sheet nor creates anything — these
 * people are already registered. Same dry-run discipline all the same.
 *
 * ⚠️ THE FOUR CONTACT SOURCES AGAIN. `respondents` has no email column, so a draft is paired to
 * a respondent through `magic_link_tokens.email` (283 rows / 138 distinct — the most complete),
 * `users.email`, and `submissions.raw_data->>'email'`. A users-only query understates reach by
 * ~57 and would simply miss most of these 10.
 */
async function runNinPromotions(live: boolean, max: number | null): Promise<void> {
  console.log('\nAC14 — free NIN promotions (no outreach, nothing created)');

  const pendingRows = (await db.execute(sql`
    SELECT r.id,
           r.reference_code AS "referenceCode",
           r.nin,
           COALESCE(
             (SELECT lower(m.email) FROM magic_link_tokens m
               WHERE m.respondent_id = r.id ORDER BY m.created_at DESC LIMIT 1),
             (SELECT lower(u.email) FROM users u WHERE u.id = r.user_id),
             (SELECT lower(s.raw_data->>'email') FROM submissions s
               WHERE s.respondent_id = r.id AND s.raw_data->>'email' IS NOT NULL
               ORDER BY s.submitted_at DESC LIMIT 1)
           ) AS email
      FROM respondents r
     WHERE r.status = 'nin_unavailable'
  `)) as { rows?: { id: string; referenceCode: string | null; nin: string | null; email: string | null }[] };

  const pending = pendingRows.rows ?? [];
  const drafts = (await db
    .select({ id: wizardDrafts.id, email: wizardDrafts.email, formData: wizardDrafts.formData })
    .from(wizardDrafts)) as DraftRow[];

  const candidates = pairDraftsToPendingRespondents(pending, drafts);
  console.log(
    `  ${pending.length} respondent(s) in nin_unavailable; ${candidates.length} paired to a draft.`,
  );

  const buckets = { promote: 0, manual: 0, noNin: 0, alreadyHas: 0, blocked: 0, promoted: 0 };
  let acted = 0;

  for (const c of candidates) {
    const decision = classifyNinPromotion(c);
    const who = c.referenceCode ?? c.respondentId;

    if (decision.verdict === 'no_nin_in_draft') { buckets.noNin++; continue; }
    if (decision.verdict === 'respondent_already_has_nin') { buckets.alreadyHas++; continue; }
    if (decision.verdict === 'manual_review_bad_shape') {
      buckets.manual++;
      // Loud, per-row, and never auto-corrected — this is the OSL-2026-RRCHDX class.
      console.log(`  ⚠️  MANUAL REVIEW  ${who}: ${decision.reason}`);
      logger.warn({ event: 'draft_adoption.nin_manual_review', respondentId: c.respondentId, reason: decision.reason });
      continue;
    }

    buckets.promote++;
    if (!live) {
      console.log(`  ✓ would promote  ${who}  nin ${maskNin(decision.nin!)}  → active`);
      continue;
    }
    if (max !== null && acted >= max) break;
    acted++;

    const result = await promoteRespondentNin({
      respondentId: c.respondentId,
      draftId: c.draftId,
      nin: decision.nin!,
      promotedAt: new Date(),
    });
    if (result.promoted) {
      buckets.promoted++;
      console.log(`  ✅ promoted      ${who}  → active`);
      logger.info({ event: 'draft_adoption.nin_promoted', respondentId: c.respondentId, draftId: c.draftId });
    } else {
      buckets.blocked++;
      console.log(`  ⛔ blocked       ${who}: ${result.reason}`);
      logger.warn({ event: 'draft_adoption.nin_promotion_blocked', respondentId: c.respondentId, reason: result.reason });
    }
  }

  logger.info({ event: 'draft_adoption.nin_promotions_complete', marker: ADOPTION_MARKER, live, ...buckets });
  console.log('\nAC14 results:');
  console.log(`  ${String(buckets.promote).padStart(4)}  promotable (well-formed NIN in the draft)`);
  console.log(`  ${String(buckets.promoted).padStart(4)}  promoted this run${live ? '' : ' (preview — nothing written)'}`);
  console.log(`  ${String(buckets.manual).padStart(4)}  MANUAL REVIEW (NIN present but not 11 digits)`);
  console.log(`  ${String(buckets.blocked).padStart(4)}  blocked (NIN clash or already promoted)`);
  console.log(`  ${String(buckets.noNin).padStart(4)}  no NIN in the draft either`);
  console.log(`  ${String(buckets.alreadyHas).padStart(4)}  respondent already holds a NIN`);
  if (!live) console.log('\n🟢 PREVIEW COMPLETE — nothing written.\n');
  if (buckets.blocked > 0) process.exitCode = 1;
}

/**
 * D2 — find the respondent this draft belongs to.
 *
 * ⚠️ ALL FOUR CONTACT SOURCES, never NIN alone. Matching by NIN resolves 28 of these drafts;
 * NIN → `magic_link_tokens.email` → `users.email` resolves 48. That 20-row gap is 10 duplicate
 * registry records created and 10 enrichable records missed — `magic_link_tokens` (283 rows /
 * 138 distinct emails) is the most complete contact source we have and a NIN-only query cannot
 * see it.
 */
async function resolveExistingRespondentId(draft: DraftRow): Promise<string> {
  const { nin } = resolveDraftIdentity(draft);
  const email = draft.email.toLowerCase();

  const result = (await db.execute(sql`
    SELECT r.id
      FROM respondents r
     WHERE (${nin} <> '' AND r.nin = ${nin})
        OR r.id IN (SELECT m.respondent_id FROM magic_link_tokens m
                     WHERE lower(m.email) = ${email} AND m.respondent_id IS NOT NULL)
        OR r.user_id IN (SELECT u.id FROM users u WHERE lower(u.email) = ${email})
     LIMIT 1
  `)) as { rows?: { id: string }[] };

  const id = result.rows?.[0]?.id;
  if (!id) {
    throw new DraftRowError(
      draft.id,
      'marked BACKFILL_THE_63 but resolves to no respondent by NIN, magic_link_tokens or users — ' +
        'the sheet may be stale; regenerate it with `draft:triage`',
    );
  }
  return id;
}

const isEntrypoint = process.argv[1]?.includes('_draft-adoption-programme');
if (isEntrypoint) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((e) => {
      logger.error({ event: 'draft_adoption.fatal', error: e instanceof Error ? e.message : String(e) });
      console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
}

export type { Plan, Counters, WizardDraftData };

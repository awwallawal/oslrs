/**
 * Story 13-49 AC14 — promote `nin_unavailable` respondents whose NIN we ALREADY HOLD.
 *
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02. AC14 was written into Dev Notes on 2026-08-02 and then
 * shipped in nothing: no task, no module, no test, no Residual — while the story's Closing
 * verdict read "Every code AC is implemented and gated". This file closes that gap.
 *
 * WHAT IT IS. 10 of the 35 `nin_unavailable` respondents supplied a NIN in their draft that was
 * never written to the respondent row. They have since been chased three times by the 9-12
 * ladder for information they had already given. This promotes them from the draft instead of
 * asking a fourth time — the cheapest 10 conversions available, requiring no outreach at all.
 *
 * WHY IT SITS BESIDE THE ADOPTION PROGRAMME rather than inside it: same input (`wizard_drafts`),
 * same operator, same run — but it is NOT an adoption. These people are already in the register
 * with a reference code. Nothing is created; one column is filled and one status advances.
 *
 * ⚠️ THE 10TH ROW IS THE POINT. `OSL-2026-RRCHDX` carries `1589857782` — ten digits, most
 * plausibly a dropped leading zero (`01589857782`). It is NOT padded and NOT dropped: it is
 * classified `manual_review` and reported, because guessing a national identity number on a
 * citizen's behalf is not a decision a script gets to make. 9 promote cleanly; the 10th goes to
 * a human. [[pattern-ship-a-fix-that-never-fires]] is avoided by the same rule that makes the
 * rest of this programme fail closed.
 *
 * Effect on the numbers: the 35 residue becomes 25, so post-adoption `nin_unavailable` is
 * 25 + 20 (D3) = 45, not 55.
 */
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/respondents.js';
import { promoteRespondentToActive } from '../respondent-identity.js';
import { ADOPTION_MARKER, NIN_PATTERN, type DraftRow, resolveDraftIdentity } from './payload.js';

/** What a candidate resolves to. Every outcome is reported; none is silent. */
export type NinPromotionVerdict =
  /** Draft carries a well-formed NIN the respondent lacks → promote. */
  | 'promote'
  /** The draft has no NIN either — nothing free to harvest here. */
  | 'no_nin_in_draft'
  /** The respondent already has a NIN; this row is not the ladder residue it looked like. */
  | 'respondent_already_has_nin'
  /** Present but not 11 digits — the dropped-leading-zero class. A human decides. */
  | 'manual_review_bad_shape';

export interface NinPromotionCandidate {
  respondentId: string;
  referenceCode: string | null;
  /** The respondent's CURRENT nin column — `null`/'' is what makes them a candidate. */
  respondentNin: string | null;
  /** The NIN as resolved from the draft (questionnaire first, per `resolveDraftIdentity`). */
  draftNin: string;
  draftId: string;
}

export interface NinPromotionDecision {
  verdict: NinPromotionVerdict;
  /** Present only when `verdict === 'promote'` — the exact value that would be written. */
  nin?: string;
  /** Operator-facing explanation. Always set for a non-promote verdict. */
  reason?: string;
}

/**
 * Classify ONE candidate. Pure — no DB — so the whole rule set is unit-testable, which is the
 * same reason `recommendDecision` is pure.
 *
 * ORDER IS THE RULE: an existing NIN outranks everything (never overwrite a national identity
 * number from a months-old draft), then absence, then shape.
 */
export function classifyNinPromotion(c: NinPromotionCandidate): NinPromotionDecision {
  const existing = (c.respondentNin ?? '').trim();
  if (existing !== '') {
    return {
      verdict: 'respondent_already_has_nin',
      reason: `respondent already holds a NIN — a draft never overwrites one`,
    };
  }

  const draftNin = c.draftNin.trim();
  if (draftNin === '') {
    return { verdict: 'no_nin_in_draft', reason: 'the draft carries no NIN either' };
  }

  if (!NIN_PATTERN.test(draftNin)) {
    return {
      verdict: 'manual_review_bad_shape',
      reason:
        `draft NIN is ${draftNin.length} character(s), not 11 — most plausibly a dropped ` +
        `leading zero. NOT padded and NOT dropped: confirm the correct value with the ` +
        `respondent, then set it via the audited admin path.`,
    };
  }

  return { verdict: 'promote', nin: draftNin };
}

export interface PromoteResult {
  respondentId: string;
  nin: string;
  /** False when another respondent already holds this NIN — FR21's uniqueness, not ours to break. */
  promoted: boolean;
  reason?: string;
}

/**
 * Write the promotion: set the NIN and advance `nin_unavailable → active`, with an audit row.
 *
 * TWO GUARDS, BOTH IN THE UPDATE ITSELF rather than in a read-then-write:
 *   1. the NIN must not already belong to somebody else (FR21) — checked first, and reported as
 *      a handled per-row outcome rather than an exception, because a duplicate NIN here means
 *      the person is probably already registered twice and that is an operator finding;
 *   2. the WHERE clause re-asserts `status = 'nin_unavailable' AND nin IS NULL`, so a row the
 *      9-12 ladder promoted between our read and our write is left alone instead of being
 *      overwritten. Same TOCTOU discipline as the ladder's own promotion UPDATE.
 */
export async function promoteRespondentNin(args: {
  respondentId: string;
  draftId: string;
  nin: string;
  promotedAt: Date;
  actorId?: string | null;
}): Promise<PromoteResult> {
  const { respondentId, draftId, nin, promotedAt } = args;

  const clash = await db.query.respondents.findFirst({
    where: and(eq(respondents.nin, nin), ne(respondents.id, respondentId)),
    columns: { id: true, referenceCode: true },
  });
  if (clash) {
    return {
      respondentId,
      nin,
      promoted: false,
      reason:
        `NIN already held by respondent ${clash.referenceCode ?? clash.id} — ` +
        `refusing to duplicate it (FR21). This pair needs a merge decision, not a promotion.`,
    };
  }

  // The promotion and its audit row go in ONE transaction, via `logActionTx`.
  //
  // ⚠️ NOT `AuditService.logAction` — that overload returns `void`, i.e. it is fire-and-forget by
  // design, and a caller CANNOT await it. In a long-lived server that is fine (the process outlives
  // the write). In a SCRIPT it is not: the first live AC14 run on 2026-08-03 promoted 10
  // respondents and wrote only 9 audit rows. The nine that landed did so because subsequent
  // iterations' `await`s yielded the event loop; the tenth — the LAST of the batch, always — was
  // still in flight when the script exited. A batch job silently loses exactly one audit row per
  // run, and the one it loses is the last, so the count looks "nearly right" and reads as a
  // rounding error rather than a bug.
  //
  // `logActionTx` returns Promise<void> and joins our transaction, so the audit row is now both
  // awaited AND atomic with the UPDATE: no promotion can exist without its trail, and a failed
  // audit write rolls the promotion back rather than leaving a silent hole.
  /**
   * 13-55 — routed through THE shared promote. The UPDATE and the audit row were already in one
   * transaction here (this path is where that lesson was learned), so what changes is not the
   * guarantee but the number of implementations: this was one of five hand-written promotes.
   *
   * ⚠️ `allowedStatuses: ['nin_unavailable']` — NARROWER than every other caller, and it must stay
   * that way. This is a batch operator path reading MONTHS-OLD drafts; letting it touch
   * `pending_nin_capture` would let a stale draft promote a row the 9-12 ladder is actively
   * working, behind the ladder's back. The FR21 clash pre-check above stays here too, because it
   * reports a per-row operator finding rather than throwing — that is this caller's contract with
   * its script, not the promote's business.
   */
  const updated = await db.transaction(async (tx) =>
    promoteRespondentToActive(tx, {
      respondentId,
      nin,
      trigger: 'draft_adoption_ac14',
      allowedStatuses: ['nin_unavailable'],
      actorId: args.actorId ?? null,
      // The 13-49 rollback key. Folded by the shared promote's JSONB `||` merge, so sibling
      // metadata (defer_reason_nin, reminder_state, adopted_by…) survives exactly as before.
      metadata: {
        nin_promoted_by: ADOPTION_MARKER,
        nin_promoted_at: promotedAt.toISOString(),
        nin_promoted_from_draft_id: draftId,
      },
      auditDetails: {
        marker: ADOPTION_MARKER,
        draftId,
        note: 'NIN recovered from the respondent’s own abandoned draft — no outreach required',
      },
    }),
  );

  if (!updated) {
    return {
      respondentId,
      nin,
      promoted: false,
      reason:
        'row was no longer `nin_unavailable` with a null NIN at write time — ' +
        'something else promoted it first; left untouched',
    };
  }

  return { respondentId, nin, promoted: true };
}

/**
 * Pair every `nin_unavailable` respondent with the draft that belongs to them, by EMAIL.
 *
 * ⚠️ Email, because that is what a draft and a respondent reliably share — a draft is
 * pre-account by construction, and matching on the NIN we are trying to recover is circular.
 *
 * ⚠️ `respondents` HAS NO EMAIL COLUMN. The caller must resolve each address from the four
 * contact sources (handoff §3c: `magic_link_tokens.email` — the most complete at 283 rows /
 * 138 distinct — then `users.email`, then `submissions.raw_data->>'email'`) and pass it in.
 * A `users`-only resolution understates reach by ~57. Keeping the resolution in the caller is
 * what keeps this function pure and unit-testable.
 */
export function pairDraftsToPendingRespondents(
  pending: ReadonlyArray<{ id: string; referenceCode: string | null; nin: string | null; email: string | null }>,
  drafts: ReadonlyArray<DraftRow>,
): NinPromotionCandidate[] {
  const byEmail = new Map<string, DraftRow>();
  for (const d of drafts) {
    const key = (d.email ?? '').trim().toLowerCase();
    if (key !== '' && !byEmail.has(key)) byEmail.set(key, d);
  }

  const out: NinPromotionCandidate[] = [];
  for (const r of pending) {
    const draft = byEmail.get((r.email ?? '').trim().toLowerCase());
    if (!draft) continue;
    out.push({
      respondentId: r.id,
      referenceCode: r.referenceCode,
      respondentNin: r.nin,
      draftNin: resolveDraftIdentity(draft).nin,
      draftId: draft.id,
    });
  }
  return out;
}

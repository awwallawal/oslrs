/**
 * Story 13-65 — THE THREE REGISTRATION SENDS, EXECUTED IN THE EMAIL WORKER.
 *
 * ⚠️ WHY THIS MODULE EXISTS AT ALL (and why the handlers are not left on `SubmissionProcessingService`).
 * The two bodies below were `private static` members of `SubmissionProcessingService`, and that
 * service imports `email.queue.ts`, `marketplace-extraction.queue.ts` and `fraud-detection.queue.ts`.
 * If `email.worker.ts` reached back into it, the cycle would be
 * `worker -> submission-processing -> queues`, with the worker itself pulled in by `workers/index.ts`
 * at app boot behind a top-level `await` (`app.ts:100-104`). ESM cycles here fail as `undefined` at
 * CALL time, not as a build error — the worst possible shape. So the handlers live here, imported by
 * the worker only, and `SubmissionProcessingService` now imports the PRODUCERS and nothing else.
 *
 * ─── WHAT QUEUEING BUYS, STATED EXACTLY AND NO STRONGER (AC9) ───
 * The queue buys BOUNDED CONCURRENCY, DURABILITY, RETRY and BACKPRESSURE; it does NOT reduce total
 * CPU and does NOT give event-loop isolation, because the workers run in the API process.
 *
 * ─── AC2: THE GUARDS RUN HERE, NOT AT ENQUEUE ───
 * Every guard 13-46, 13-21 and 13-12 put in front of these sends is re-evaluated in THIS module,
 * immediately before the provider call, in its original order. Build the payload at request time and
 * evaluate the guards at request time, and a job that sits in a backlog dispatches OUTSIDE the window
 * its own gate approved. The 5-day contact gap in particular is a TIME window.
 *
 * ⛔ `buildDedupKey` is NOT the retry-safety mechanism and is not cited as one: it is produce-side, a
 * non-atomic EXISTS-then-SET, has a 300s TTL, and is skipped entirely for `critical` types, while the
 * third BullMQ retry lands at 10 minutes. The load-bearing mechanism is the send-once MARKER in
 * `respondents.metadata`, re-checked below on every attempt.
 *
 * ─── THE RESIDUAL, STATED RATHER THAN ENGINEERED AWAY (AC2) ───
 * Both markers are stamped AFTER a confirmed dispatch, by existing deliberate design (13-21 review
 * M1): a stamp failure must not false-count a good send. A crash in the window between
 * provider-success and stamp therefore still yields ONE duplicate on the next run. That window is
 * UNCHANGED by this story — the queue does not close it. What the queue DOES change is that the
 * window is now entered up to 3 times instead of once. Accepted: a duplicate thank-you is a
 * nuisance, a lost one is a citizen who never heard from us.
 */
import { eq, sql } from 'drizzle-orm';
import pino from 'pino';
import type {
  RegistrationConfirmationEmailData,
  RegistrationMagicLinkEmailData,
  RegistrationThankYouEmailData,
} from '@oslsr/types';
import { db } from '../db/index.js';
import { respondents } from '../db/schema/index.js';
import type { RespondentMetadata } from '../db/schema/respondents.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';
import { EmailService } from './email.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { getSuppressedEmails } from './email-events.service.js'; // Story 13-12 (13-9 suppression)
import { buildThankYouEmail, buildThankYouReferralUrl, firstNameFrom } from './thankyou-email.js'; // Story 13-12
import { recordAutoSendFailure } from './email-autosend-monitor.js'; // Story 13-21 (AC4)
// Story 13-46 (AC2) — the SAME gap query + gap constant the four blast/backfill scripts inherit via
// `filterMarketingCohort`; this is the one in-request path that never consumed it.
import { getRecentlyContactedEmails, resolveGapDays } from './campaign-contact.service.js';
import { toCanonicalEmail } from '../lib/canonical-email.js';
import {
  recordRegistrationAutoSend,
  recordThankYouSuppressed,
} from '../middleware/registration-burst.js'; // Story 13-46 (AC3 / review A3)

const logger = pino({ name: 'registration-email-jobs' });

/**
 * Story 13-46 (review A3) — the ONLY category the auto thank-you's gap read considers.
 * Deliberately NOT the whole marketing set; see the block in `handleRegistrationThankYouJob`.
 */
const AUTO_SEND_GAP_CATEGORY = 'thankyou-referral';

const AUTO_CAMPAIGN_ID = 'thankyou-referral-auto';

/**
 * Story 13-65 (AC6) — the ONE thing a handler needs to know about its BullMQ job.
 *
 * `recordAutoSendFailure` pages an operator. A paging counter that fires on a recoverable event is a
 * counter the operator learns to ignore, so it must fire only when the job has genuinely run out of
 * attempts — the same condition `logEmailFailureToAudit` already uses.
 */
export interface RegistrationJobContext {
  /** True iff this is the job's LAST attempt (`job.attemptsMade + 1 >= job.opts.attempts`). */
  isFinalAttempt: boolean;
}

/** Story 9-58 — plain-language status line for the confirmation email. */
const STATUS_CONFIRMATION_TEXT: Record<string, string> = {
  active: 'Active — your registration is complete.',
  pending_nin_capture: 'Pending — we still need your NIN to finish your registration.',
  nin_unavailable: 'Pending — your details are saved.',
  imported_unverified: 'On file — your record is awaiting verification.',
};

/**
 * Report a send failure the way AC6 requires, then let the caller hand the error back to BullMQ.
 *
 * Attempts 1-2 stay SILENT on the counter (they are recoverable and the worker will retry); the
 * worker's own `email.job.failed` log still fires on every attempt, so nothing is invisible.
 */
async function reportFailure(
  kind: 'confirmation' | 'thankyou',
  respondentId: string,
  error: string,
  ctx: RegistrationJobContext,
): Promise<void> {
  if (ctx.isFinalAttempt) {
    // Story 13-21 (AC4) — counted + loud, and now only when the email is genuinely lost.
    await recordAutoSendFailure({ kind, respondentId, error });
    return;
  }
  logger.warn({
    event: 'registration_autosend.transient_failure',
    kind,
    respondentId,
    error,
    note: 'not final attempt — BullMQ will retry; NOT counted as an auto-send failure (13-65 AC6)',
  });
}

// ============================================================================
// 1. Pending-NIN magic link (transactional, `critical`)
// ============================================================================

/**
 * Story 13-65 (AC1) — send the already-issued pending-NIN resume link.
 *
 * ⚠️ THE TOKEN IS NOT MINTED HERE. `MagicLinkService.issueToken` stays awaited on the request, so
 * there is never a window in which a pending-NIN respondent exists with no token for the T+2d
 * reminder worker to reference. Only the SEND moved.
 *
 * 🔴 A BOUNDED CLAIM, RECORDED HONESTLY. `MagicLinkService.sendMagicLinkEmail` SWALLOWS a provider
 * failure by deliberate security design (it must never reveal whether an address exists), and this
 * story's Non-goal 3 forbids changing that method's body. So this job gains bounded concurrency,
 * durability and backpressure but NOT retry-on-5xx: a provider refusal is still logged and dropped,
 * exactly as today. That loss already has an existing re-drive path — the T+2d pending-NIN reminder
 * worker re-issues the link — which is why the conservative reading of Non-goal 3 was taken rather
 * than widening the /login flow's send. Do not describe this job as "retried on provider failure".
 */
export async function handleRegistrationMagicLinkJob(
  data: RegistrationMagicLinkEmailData,
): Promise<void> {
  await MagicLinkService.sendMagicLinkEmail({
    email: data.email,
    tokenPlaintext: data.tokenPlaintext,
    purpose: data.purpose,
    expiresAt: new Date(data.expiresAt),
  });

  logger.info({
    event: 'registration_magic_link.job_completed',
    respondentId: data.respondentId,
    purpose: data.purpose,
  });
}

// ============================================================================
// 2. Reference-code confirmation (transactional, `critical`)
// ============================================================================

/**
 * Story 9-58 — proactive registration-confirmation email carrying the human-friendly reference code
 * + plain-language status + a pointer to the self-service status check. NO magic-link and an
 * explicit anti-phishing line.
 *
 * ⚖️ THE DEV-NOTES DECISION, MADE AND STATED (13-65). The story's Dev Notes say "the confirmation
 * email has NO equivalent marker today ... decide this explicitly". Verified against the tree: it
 * DOES have one — `metadata.confirmation_email_sent_at`, added by 9-58 review L1, checked below and
 * stamped after a confirmed dispatch. So the decision is: KEEP IT, unchanged, and move it into the
 * worker with the rest of the guard block. No new marker is added, and the confirmation is therefore
 * retry-safe by exactly the same mechanism as the thank-you.
 *
 * ⚠️ NO `category` IS PASSED to `sendGenericEmail`, exactly as before. A reference code is the
 * citizen's own record, not marketing: giving it a marketing category would put it behind 13-46's
 * marketing throttle and into the `campaign_sends` ledger, where the 5-day per-address gap would
 * then suppress it.
 */
async function confirmationJobImpl(data: RegistrationConfirmationEmailData): Promise<void> {
  // review C11 — `ctx` became dead here when the B3 wrapper took over failure reporting. Removed
  // rather than left as a silent lie about what this function consults.
  // Story 9-58 (review L1) — explicit idempotency guard: only send when the respondent has no
  // `metadata.confirmation_email_sent_at` stamp. Makes the "send once" guarantee a stored fact
  // rather than emergent from the `_isNew` flag. Story 13-65 (AC2): re-read on EVERY attempt, so a
  // BullMQ retry after a successful dispatch cannot double-send.
  const existing = await db.query.respondents.findFirst({
    where: eq(respondents.id, data.respondentId),
    columns: { metadata: true },
  });
  const existingMetadata = (existing?.metadata ?? null) as RespondentMetadata | null;
  if (existingMetadata?.confirmation_email_sent_at) {
    logger.info({
      event: 'registration_confirmation.email_skipped_already_sent',
      respondentId: data.respondentId,
    });
    return;
  }

  const brand = '#9C1E23';
  const statusText = STATUS_CONFIRMATION_TEXT[data.status] ?? 'Your registration is on file.';
  const checkUrl = `${process.env.SUPPORT_URL || 'https://oyoskills.com'}/check-registration`;
  const subject = "You've been registered — Oyo State Skills Registry";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${brand}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour &amp; Skills Registry</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <p>You've been registered in the Oyo State Skills Registry.</p>
    <p style="font-weight: bold;">${statusText}</p>
    <p style="margin:20px 0;padding:12px 16px;background:#f6f6f6;border-radius:6px;font-size:14px;">Your application reference: <strong style="font-family:ui-monospace,monospace;letter-spacing:0.5px;">${data.referenceCode}</strong></p>
    <p style="color: #666; font-size: 14px;">Quote this reference if you contact support, or check your status anytime at <a href="${checkUrl}" style="color: ${brand};">${checkUrl}</a>.</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px;">We will never ask for your password or NIN by email.</p>
    <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.</p>
  </div>
</body></html>`;
  const text = `You've been registered in the Oyo State Skills Registry.\n\n${statusText}\n\nYour application reference: ${data.referenceCode}\n\nQuote this reference if you contact support, or check your status anytime at ${checkUrl}.\n\nWe will never ask for your password or NIN by email.\n\n— Oyo State Labour & Skills Registry`;

  const result = await EmailService.sendGenericEmail({ to: data.email, subject, html, text });
  if (!result.success) {
    const error = result.error ?? 'unknown';
    // Story 13-65 (AC1 / §4a) — THROW so BullMQ retries at 2min then 10min (13-65 D5: attemptsMade>=1, so the 30s entry is unreachable). Before this story this
    // path `return`ed and the email was gone forever; that silent loss is the gap being closed.
    // ⚠️ review B3 — the failure is REPORTED BY THE WRAPPER below, not here, so that a THROWN
    // failure counts identically to a returned-unsuccessful one.
    throw new Error(`registration confirmation send failed: ${error}`);
  }

  // Story 9-58 (review L1) — stamp the explicit idempotency marker only after a confirmed dispatch.
  // JSONB `||` preserves any sibling metadata keys (guardian, normalisation_warnings, etc.).
  // Story 13-21 (review M1) — the email ALREADY dispatched successfully here; a marker-stamp failure
  // must NOT route through recordAutoSendFailure — that would false-count a good send and could trip
  // a spurious AC4 page. It DOES risk a duplicate on the next attempt (the marker is the idempotency
  // guard), so log it loudly at warn. Own try so it can't reach the caller's failure path.
  try {
    await db.execute(sql`
      UPDATE "respondents"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })}::jsonb
      WHERE "id" = ${data.respondentId}
    `);
  } catch (stampErr) {
    logger.warn({
      event: 'registration_confirmation.marker_stamp_failed',
      respondentId: data.respondentId,
      error: stampErr instanceof Error ? stampErr.message : String(stampErr),
    });
  }
}

// ============================================================================
// 3. Evergreen thank-you / referral (MARKETING, `standard`)
// ============================================================================

/**
 * Story 13-12 — evergreen thank-you + referral auto-send on end-to-end completion.
 *
 * Gated to SELF-SERVICE (`source='public'`) completers (they hold the link + can refer peers;
 * enumerator/clerk/imported rows get the 9-58 confirmation instead). Idempotent via the
 * `metadata.thankyou_referral_sent_at` send-once marker; honors the 13-9 suppression list; tagged
 * `thankyou-referral-auto` (DISTINCT from the one-off blast) so the funnel separates organic
 * onboarding referrals from the campaign blast.
 *
 * ⚠️ Story 13-65 (AC2) — GUARD ORDER IS PART OF THE CONTRACT AND IS PRESERVED VERBATIM:
 *   source gate -> send-once marker -> suppression -> 5-day per-address gap -> render -> dispatch
 *   -> recordRegistrationAutoSend() -> stamp the marker.
 */
async function thankYouJobImpl(data: RegistrationThankYouEmailData): Promise<void> {
  const r = await db.query.respondents.findFirst({
    where: eq(respondents.id, data.respondentId),
    columns: { source: true, firstName: true, metadata: true },
  });
  if (!r) return;
  if (r.source !== 'public') return; // referral ask is for self-service registrants only
  const metadata = (r.metadata ?? null) as RespondentMetadata | null;
  if (metadata?.thankyou_referral_sent_at) {
    // Story 13-65 (AC2) — THE mechanism that makes a BullMQ retry safe. Re-read on every attempt.
    logger.info({ event: 'thankyou_referral_auto.skipped_already_sent', respondentId: data.respondentId });
    return;
  }
  const suppressed = await getSuppressedEmails([data.email]);
  if (suppressed.has(data.email.trim().toLowerCase())) {
    logger.info({ event: 'thankyou_referral_auto.skipped_suppressed', respondentId: data.respondentId });
    return;
  }

  /**
   * Story 13-46 (AC2) — PER-ADDRESS THROTTLE. This is the ONE marketing path that skips the
   * shared cohort guard: `filterMarketingCohort` is inherited by all four blast/backfill
   * scripts and by NO in-request path.
   *
   * ⚠️ WHY THE EXISTING GUARDS DO NOT COVER THIS. The send-once marker above is stamped on the
   * RESPONDENT row, and there is no `email` column on `respondents` at all — the address lives
   * in `submissions.raw_data` and `users.email`, and the wizard's user insert is
   * `onConflictDoNothing`, so it REUSES an account rather than rejecting the registration.
   * A second registration with the same address therefore mints a NEW respondent row that
   * walks straight past the marker. One address, N registrations, N emails — the mail cannon.
   * The ADDRESS is the only key that holds.
   *
   * ─── THE FAIL-SOFT-LEDGER DIRECTION, DECIDED AND RECORDED (13-46 AC2) ───
   * CHOSEN: on a ledger READ ERROR, and on a missing row, ALLOW the send. The opposite direction
   * converts a degraded INSTRUMENTATION event into total loss of a citizen-facing email, and the
   * residual risk of the permissive direction is BOUNDED by 13-46 AC1's cap, which is evaluated
   * independently at `EmailService.dispatch` from Redis, not from this ledger. Two guards with two
   * different failure modes: the address gap fails open, the volume cap fails closed.
   *
   * 🔴 Story 13-65 — THIS IS WHY THE GUARD BLOCK MOVED WHOLE. The gap is a TIME window. Evaluated
   * at enqueue and sent from a backlog ten minutes later, this check would have approved a send
   * outside the window it measured.
   */
  const canonicalEmail = toCanonicalEmail(data.email);
  try {
    /**
     * Story 13-46 (review A3 / finding H3) — SCOPED TO THIS CATEGORY. ⚖️ Awwal's ruling, 2026-08-22.
     * A broad read across all marketing categories lost real email: a re-engagement blast on Monday
     * suppressed the thank-you for someone who registered on Tuesday, permanently. The narrower read
     * is also the MORE PRECISE guard for AC2's own threat — "has this address already had a
     * THANK-YOU recently", not "has it had any marketing at all".
     *
     * ⚠️ TOCTOU, NAMED (review A14 / finding L1): this reads `campaign_sends` BEFORE the send and the
     * row is written AFTER it, so two sends for one address in the same instant both pass. The window
     * is milliseconds and the overshoot is one extra email, so it is accepted rather than closed.
     */
    const recentlyContacted = await getRecentlyContactedEmails([data.email], undefined, undefined, {
      categories: [AUTO_SEND_GAP_CATEGORY],
    });
    if (recentlyContacted.has(canonicalEmail)) {
      // COUNTED, not just logged — the falsifier for the A3 ruling. REOPEN TRIGGER: a non-trivial
      // count on a day with no duplicate-registration activity.
      recordThankYouSuppressed();
      logger.info({
        event: 'thankyou_referral_auto.skipped_duplicate_thankyou',
        respondentId: data.respondentId,
        gapDays: resolveGapDays(),
        category: AUTO_SEND_GAP_CATEGORY,
        note: 'this ADDRESS already had a thank-you inside the gap — the mail-cannon case AC2 exists for',
      });
      return;
    }
  } catch (gapErr) {
    // Fail-OPEN, per the decision recorded above. Loud so a persistent failure is visible.
    logger.warn({
      event: 'thankyou_referral_auto.contact_gap_check_failed',
      respondentId: data.respondentId,
      error: gapErr instanceof Error ? gapErr.message : String(gapErr),
      note: 'contact-gap read failed — ALLOWING the send; AC1 volume cap remains the ceiling',
    });
  }

  const referralUrl = buildThankYouReferralUrl(AUTO_CAMPAIGN_ID);
  const content = buildThankYouEmail(firstNameFrom(r.firstName), referralUrl);
  const result = await EmailService.sendGenericEmail(
    { to: data.email, subject: content.subject, html: content.html, text: content.text },
    'thankyou-referral',
    AUTO_CAMPAIGN_ID,
  );
  if (!result.success) {
    /**
     * Story 13-46 (review A2 / finding H2) — A DELIBERATE CAP REFUSAL IS NOT A FAILURE.
     * Routing cap refusals into `recordAutoSendFailure` would hand the operator the WRONG DIAGNOSIS
     * ("check the Resend dashboard") at the exact moment the right one matters. The operator has
     * already been told, once per window, by `notification.cap_exceeded`.
     *
     * 🔴 Story 13-65 — AND IT MUST NOT THROW. Throwing would spend all three BullMQ attempts against
     * a cap that is a DAILY ceiling and will still be there 10 minutes later, then park the job in
     * the failed set. No marker is stamped, so the send can be re-driven once the cap clears —
     * exactly as before this story.
     */
    if (result.refusedByCap) {
      logger.warn({
        event: 'thankyou_referral_auto.refused_by_cap',
        respondentId: data.respondentId,
        reason: result.error,
        note: 'marketing cap refused this send — NOT an auto-send failure; no marker stamped, so it can be re-driven once the cap clears',
      });
      return;
    }
    const error = result.error ?? 'unknown';
    // Story 13-65 (§4a) — THROW so BullMQ retries. Before this story this path `return`ed and the
    // email was gone forever. ⚠️ review B3 — reported by the WRAPPER below, not here.
    throw new Error(`registration thank-you send failed: ${error}`);
  }

  // Story 13-46 (AC3) — count a DISPATCHED auto thank-you for the burst alert's "auto-sends in
  // window". Counted here, after a confirmed send, so a refused or failed send never inflates the
  // number the operator uses to judge outbound pressure.
  //
  // ⚠️ Story 13-65 (AC5) — this now fires at WORKER time, not request time. Under a backlog the
  // auto-send count LAGS the submit count in the same window. The burst alert's queue-depth field is
  // what makes that lag legible; the call stays HERE, after a confirmed dispatch, because it counts
  // sends, not intentions, and 13-46 judges marketing headroom with it.
  recordRegistrationAutoSend();

  // Stamp the send-once marker only after a confirmed dispatch (JSONB merge preserves siblings).
  // Story 13-21 (review M1) — the email already dispatched; a stamp failure must NOT count as a send
  // failure (false AC4 page). Own try so a stamp error can't reach the caller's failure path.
  try {
    await db.execute(sql`
      UPDATE "respondents"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ thankyou_referral_sent_at: new Date().toISOString() })}::jsonb
      WHERE "id" = ${data.respondentId}
    `);
  } catch (stampErr) {
    logger.warn({
      event: 'thankyou_referral_auto.marker_stamp_failed',
      respondentId: data.respondentId,
      error: stampErr instanceof Error ? stampErr.message : String(stampErr),
    });
  }

  AuditService.logAction({
    actorId: null,
    action: AUDIT_ACTIONS.OPERATOR_THANKYOU_REFERRAL_SENT,
    targetResource: AUDIT_TARGETS.RESPONDENT,
    targetId: data.respondentId,
    details: {
      email: data.email,
      channel: 'email',
      campaign: AUTO_CAMPAIGN_ID,
      auto: true,
      provider_message_id: result.messageId ?? null,
    },
    ipAddress: 'system',
    userAgent: 'registration-email-jobs.auto-thankyou',
  });
}


/**
 * Story 13-65 — DUPLICATE-EXPOSURE RESIDUALS, stated because the queue widened them (review B9/B10).
 *
 * The story already names the contact-gap TOCTOU and the crash-between-dispatch-and-stamp window.
 * Queueing adds two more, and a guard's bound deserves the same honesty as a cap's derivation:
 *
 * 1. **CONCURRENT PROCESSING OF THE SAME RESPONDENT (finding M9).** Each handler reads the
 *    send-once marker, sends, then stamps. Two jobs for one `respondentId` — a wizard enqueue
 *    racing a backfill enqueue, or a stalled-job re-delivery racing the original — can be picked up
 *    by the 5-way worker CONCURRENTLY and both pass the check. Before this story the sends were
 *    serial within one request and this interleaving did not exist. Bounded by worker concurrency,
 *    and the cost is one duplicate email; closing it needs a per-respondent lock, which trades a
 *    rare duplicate for a new stall mode.
 *
 * 2. **RETRY AFTER A LATE PROVIDER TIMEOUT (finding L10).** A provider call that times out AFTER
 *    the message was accepted returns `{success:false}`, which now THROWS so BullMQ retries — up to
 *    3 delivered copies. Before this story that same case produced ZERO emails (the path `return`ed
 *    and the send was lost). The change is deliberate: losing a citizen's email silently was the
 *    worse failure. But "up to 3" is the honest number, not "at most one duplicate".
 */

/**
 * Story 13-65 (review B3 / finding H4) — THE ONE PLACE A FAILURE IS COUNTED.
 *
 * ⚠️ THE BUG THIS CLOSES. Before this story both senders wrapped their WHOLE body in
 * `try { ... } catch { await recordAutoSendFailure(...) }`, so a failure of the `respondents`
 * lookup, of `getSuppressedEmails`, of template building, or a provider client that THROWS rather
 * than returning `{success:false}` was counted and could page. After the move, `reportFailure` was
 * reachable only from inside `if (!result.success)` — with no outer catch. Every other exception
 * propagated to the worker, which logs and (on the final attempt) writes an audit row, but NEVER
 * calls `recordAutoSendFailure`.
 *
 * So 13-21's counter — built to page after 5 failures with "the confirmation + thank-you/referral
 * loop may be down" — went blind precisely when the DB or the email-events service is the thing
 * that is down, which is the burst-day failure mode it exists for.
 *
 * Reporting happens on the FINAL attempt only (`ctx.isFinalAttempt`), so a recoverable 5xx that
 * succeeds on retry does not page — that is AC6's rule and it is unchanged. The error is always
 * re-thrown, so BullMQ's retry/backoff is untouched.
 */
async function reportThenRethrow<T>(
  kind: 'confirmation' | 'thankyou',
  respondentId: string,
  ctx: RegistrationJobContext,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    await reportFailure(kind, respondentId, err instanceof Error ? err.message : String(err), ctx);
    throw err;
  }
}

export async function handleRegistrationConfirmationJob(
  data: RegistrationConfirmationEmailData,
  ctx: RegistrationJobContext,
): Promise<void> {
  return reportThenRethrow('confirmation', data.respondentId, ctx, () =>
    confirmationJobImpl(data),
  );
}

export async function handleRegistrationThankYouJob(
  data: RegistrationThankYouEmailData,
  ctx: RegistrationJobContext,
): Promise<void> {
  return reportThenRethrow('thankyou', data.respondentId, ctx, () => thankYouJobImpl(data));
}

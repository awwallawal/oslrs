/**
 * Story 13-49 AC9 — the message set for an adopted person.
 *
 * WHY THIS IS A SERVICE AND NOT SCRIPT CODE. Two reasons, both learned the hard way in this
 * story:
 *
 * 1. `scripts/` sits OUTSIDE tsconfig, so a bad `NotificationCategory` literal there compiles
 *    clean and fails at runtime on a live send. Here it is type-checked. (Both of this
 *    story's category literals were wrong when they lived in the script — `registration_status`
 *    and `reengagement` — and `tsc --noEmit` was green over them.)
 * 2. The 13-24 anti-fragmentation guard exists because three blast scripts each re-derived
 *    their own cohort filter. Send policy belongs next to the other send policy — this is the
 *    same layer, and the same suppression call, that `submission-processing.service.ts` uses
 *    for the 9-58 confirmation and the 13-12 thank-you.
 *
 * ⚠️ SUPPRESSION YES, CONTACT-GAP NO — and the distinction is deliberate.
 * These are TRANSACTIONAL sends: we just created a registry record for this person and are
 * telling them their OSLRS number. Routing them through `filterMarketingCohort` would apply
 * the 5-day marketing gap, and anyone contacted recently would be silently adopted and never
 * told — a record in a government register that its subject does not know exists. Suppression
 * (bounce / complaint / unsubscribe) still applies, because retrying a hard bounce helps
 * nobody. The D4 INVITATION is marketing and does inherit the shared filter, in the script.
 */
import pino from 'pino';
import { EmailService } from '../email.service.js';
import { getSuppressedEmails } from '../email-events.service.js';
import { SubmissionProcessingService } from '../submission-processing.service.js';
import { buildAdoptionConfirmationEmail, ADOPTION_CAMPAIGN_ID } from './messages.js';

const logger = pino({ name: 'draft-adoption-send' });

export interface SendAdoptionArgs {
  respondentId: string;
  email: string;
  firstName: string;
  /** The minted OSLRS number. Without it there is no confirmation to send. */
  referenceCode: string | null;
  /**
   * D3 — the record is `pending_nin_capture`, so the confirmation must NOT claim it is active
   * nor invite them to "add what is missing". See AdoptionConfirmationArgs.pendingNin: that
   * invitation produced a 24% duplicate rate on the D3 cohort.
   */
  pendingNin?: boolean;
}

export type AdoptionSendOutcome =
  | { sent: true }
  | { sent: false; reason: 'suppressed' | 'no_reference_code' };

/**
 * Send the adopted person's confirmation, then the evergreen thank-you/referral.
 *
 * The thank-you goes through `sendRegistrationAutoEmails` with `isNew: false` ON PURPOSE:
 * that skips the generic 9-58 "your registration is complete" confirmation — which would be a
 * near-duplicate of the adoption copy, and wrong in tone for someone who never pressed
 * submit — while still firing the 13-12 thank-you, which self-gates on `source='public'`, its
 * own send-once marker and suppression.
 *
 * Throws on a failed dispatch so the runner can count the row as failed; it must not be
 * fail-soft here, because "adopted but never told" is the outcome this story exists to avoid.
 */
export async function sendAdoptionMessages({
  respondentId,
  email,
  firstName,
  referenceCode,
  pendingNin = false,
}: SendAdoptionArgs): Promise<AdoptionSendOutcome> {
  if (!referenceCode) return { sent: false, reason: 'no_reference_code' };

  const suppressed = await getSuppressedEmails([email]);
  if (suppressed.has(email.trim().toLowerCase())) return { sent: false, reason: 'suppressed' };

  const mail = buildAdoptionConfirmationEmail({ firstName, referenceCode, pendingNin });
  const result = await EmailService.sendGenericEmail(
    { to: email, ...mail },
    'registration-status',
    ADOPTION_CAMPAIGN_ID,
  );
  if (!result.success) {
    throw new Error(`adoption confirmation failed for ${respondentId}: ${result.error ?? 'unknown'}`);
  }

  /**
   * Story 13-65 — this ENQUEUES the thank-you now; it no longer dials the provider.
   *
   * ⚠️ review B6 / finding M6 — THE ENQUEUE FAILURE MUST NOT FAIL THE ROW. An earlier version let
   * it throw, on the reasoning that a failed row is better than a silently dropped referral link.
   * That reasoning is right in general and WRONG here, because of what has already happened by this
   * line: the adoption confirmation was dispatched and ledgered ABOVE. Throwing now reports a row
   * whose citizen-facing email SUCCEEDED as failed — and this runner has a recorded duplicate
   * history (13-49: 174 adopted, 7 duplicate records). There is no send-once marker on the adoption
   * confirmation, so re-driving that "failed" row re-sends it. We would be trading a missing
   * referral link for a duplicate confirmation, which is the worse of the two.
   *
   * So: catch, log LOUDLY (a persistent Redis failure must be visible), and still report
   * `{ sent: true }` — which is the truth about the half that matters to the citizen.
   */
  try {
    await SubmissionProcessingService.sendRegistrationAutoEmails({
      respondentId,
      email,
      isNew: false,
    });
  } catch (err) {
    logger.error({
      event: 'draft_adoption.thankyou_enqueue_failed',
      respondentId,
      error: err instanceof Error ? err.message : String(err),
      note: 'adoption confirmation ALREADY SENT and ledgered; the row is reported sent so a re-run cannot duplicate it. The referral thank-you was not queued — re-drive it separately if this persists.',
    });
  }

  return { sent: true };
}

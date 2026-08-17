/**
 * Story 13-59 (AC1, AC2) — the side effect that closes the activation journey.
 *
 * ## Why this is a separate module and not four lines inline
 *
 * `activateAccount` is already 200 lines with a transaction, a photo pipeline
 * and three failure modes. The completion email has one hard requirement that
 * is easy to lose in that: **it must never, under any circumstance, fail the
 * activation.** Keeping it here makes the try/catch the module's entire
 * contract rather than one more nested block, and makes the guarantee testable
 * on its own.
 *
 * ## AC2.2 — a failed courtesy email must not roll back a live account
 *
 * By the time this runs the transaction has committed and the person's account
 * IS active. Throwing here would surface as an activation failure on a screen
 * belonging to someone whose account already works — and, worse, they would
 * likely retry, hit `AUTH_ALREADY_ACTIVATED`, and conclude the platform is
 * broken. So: every failure is logged and swallowed. `sendActivationComplete`
 * returns void and its promise never rejects.
 */
import { eq } from 'drizzle-orm';
import { formatStaffId } from '@oslsr/types';
import pino from 'pino';
import { db } from '../db/index.js';
import { lgas } from '../db/schema/index.js';
import { EmailService } from './email.service.js';

const logger = pino({ name: 'staff-activation-notification' });

/**
 * The staff sign-in door.
 *
 * ⚠️ `/staff/login`, NOT `/login`. The redirect bug fixed on 2026-08-09 sent
 * newly activated staff to the CITIZEN page, which hard-rejects them — a dead
 * end for 100% of new staff. Putting `/login` in this copy would reintroduce
 * the same dead end through a different door.
 */
export function buildStaffLoginUrl(): string {
  const base = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
  return `${base.replace(/\/+$/, '')}/staff/login`;
}

export interface ActivationCompleteParams {
  userId: string;
  email: string;
  fullName: string;
  /** Canonical role slug from `roles.name`. */
  roleName: string;
  /** `users.lga_id`; null for state-wide / back-office roles. */
  lgaId: string | null;
}

/**
 * Send the activation-completion email. Never throws, never rejects.
 *
 * Awaited by the caller (rather than fire-and-forget) so the send is ordered
 * before the response and is therefore OBSERVABLE — AC3.2 asks for an assertion
 * on the send record, and a floating promise cannot be asserted on without a
 * sleep. The cost is one email round-trip on a once-per-account path.
 */
export async function sendActivationComplete(params: ActivationCompleteParams): Promise<void> {
  try {
    let lgaName: string | null = null;
    if (params.lgaId) {
      const lga = await db.query.lgas.findFirst({
        where: eq(lgas.id, params.lgaId),
        columns: { name: true },
      });
      lgaName = lga?.name ?? null;
    }

    const result = await EmailService.sendStaffActivationCompleteEmail({
      email: params.email,
      fullName: params.fullName,
      roleName: params.roleName,
      lgaName,
      staffId: formatStaffId(params.userId),
      loginUrl: buildStaffLoginUrl(),
    });

    if (result.success) {
      logger.info({
        event: 'activation.completion_email_sent',
        userId: params.userId,
        role: params.roleName,
        messageId: result.messageId,
      });
      return;
    }

    /*
     * A `success: false` result is the ORDINARY failure (provider down, service
     * disabled, budget exhausted). It is a warn, not an error: the account is
     * fine and the artefacts are still reachable in-app, which is the whole
     * point of the no-attachments ruling — the email is the prompt, not the
     * carrier, so losing it degrades the journey rather than breaking it.
     */
    logger.warn({
      event: 'activation.completion_email_failed',
      userId: params.userId,
      role: params.roleName,
      error: result.error,
    });
  } catch (err: unknown) {
    /*
     * The EXCEPTIONAL failure — most likely `STAFF_ACTIVATION_COPY_MISSING`
     * from a role nobody wrote copy for (AC1.2's loud failure, caught here so
     * it is loud in the LOG rather than in the person's activation). Also
     * covers a DB hiccup on the LGA lookup.
     */
    logger.error({
      event: 'activation.completion_email_errored',
      userId: params.userId,
      role: params.roleName,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

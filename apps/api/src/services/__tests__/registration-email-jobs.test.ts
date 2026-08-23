import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 13-65 — the worker-side registration handlers, unit level.
 *
 * This file owns AC6 (WHEN the paging counter fires) and the retry/throw contract. The
 * marker-and-provider behaviour that needs a real `respondents` row lives in the sibling
 * `registration-email-jobs.integration.test.ts`.
 *
 * ⚠️ `vitest.base.ts` sets `mockReset: true`, which strips any implementation written inside a
 * `vi.mock()` factory before EVERY test. Every stub below is therefore a bare `vi.fn()` created in
 * `vi.hoisted()`, with its implementation set in `beforeEach`.
 */
const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  execute: vi.fn(),
  sendGenericEmail: vi.fn(),
  recordAutoSendFailure: vi.fn(),
  getSuppressedEmails: vi.fn(),
  getRecentlyContactedEmails: vi.fn(),
  recordRegistrationAutoSend: vi.fn(),
  recordThankYouSuppressed: vi.fn(),
  logAction: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    query: { respondents: { findFirst: (...a: unknown[]) => h.findFirst(...a) } },
    execute: (...a: unknown[]) => h.execute(...a),
  },
}));

vi.mock('../email.service.js', () => ({
  EmailService: { sendGenericEmail: (...a: unknown[]) => h.sendGenericEmail(...a) },
}));

vi.mock('../email-autosend-monitor.js', () => ({
  recordAutoSendFailure: (...a: unknown[]) => h.recordAutoSendFailure(...a),
}));

vi.mock('../email-events.service.js', () => ({
  getSuppressedEmails: (...a: unknown[]) => h.getSuppressedEmails(...a),
}));

vi.mock('../campaign-contact.service.js', () => ({
  getRecentlyContactedEmails: (...a: unknown[]) => h.getRecentlyContactedEmails(...a),
  resolveGapDays: () => 5,
}));

vi.mock('../../middleware/registration-burst.js', () => ({
  recordRegistrationAutoSend: (...a: unknown[]) => h.recordRegistrationAutoSend(...a),
  recordThankYouSuppressed: (...a: unknown[]) => h.recordThankYouSuppressed(...a),
}));

vi.mock('../audit.service.js', () => ({
  AuditService: { logAction: (...a: unknown[]) => h.logAction(...a) },
  AUDIT_ACTIONS: { OPERATOR_THANKYOU_REFERRAL_SENT: 'operator.thankyou_referral.sent' },
  AUDIT_TARGETS: { RESPONDENT: 'respondent' },
}));

vi.mock('../magic-link.service.js', () => ({
  MagicLinkService: { sendMagicLinkEmail: (...a: unknown[]) => h.sendMagicLinkEmail(...a) },
}));

vi.mock('../thankyou-email.js', () => ({
  buildThankYouEmail: () => ({ subject: 'Thanks', html: '<p>Thanks</p>', text: 'Thanks' }),
  buildThankYouReferralUrl: () => 'https://oyoskills.com/r/thankyou-referral-auto',
  firstNameFrom: (n: string | null) => n ?? '',
}));

import {
  handleRegistrationConfirmationJob,
  handleRegistrationThankYouJob,
  handleRegistrationMagicLinkJob,
} from '../registration-email-jobs.js';

const FINAL = { isFinalAttempt: true };
const NOT_FINAL = { isFinalAttempt: false };

const CONFIRMATION = { respondentId: 'r1', email: 'c@x.test', referenceCode: 'OSL-2026-000001', status: 'active' };
const THANKYOU = { respondentId: 'r1', email: 't@x.test' };

beforeEach(() => {
  h.findFirst.mockResolvedValue({ metadata: null, source: 'public', firstName: 'Ada' });
  h.execute.mockResolvedValue(undefined);
  h.sendGenericEmail.mockResolvedValue({ success: true, messageId: 'm1' });
  h.recordAutoSendFailure.mockResolvedValue({ failuresToday: 1, alerted: false });
  h.getSuppressedEmails.mockResolvedValue(new Set<string>());
  h.getRecentlyContactedEmails.mockResolvedValue(new Set<string>());
  h.recordRegistrationAutoSend.mockReturnValue(undefined);
  h.recordThankYouSuppressed.mockReturnValue(undefined);
  h.logAction.mockReturnValue(undefined);
  h.sendMagicLinkEmail.mockResolvedValue(undefined);
});

// ── AC6 — the paging counter must stop crying wolf on attempt 1 ────────────

describe('AC6 — recordAutoSendFailure fires ONLY on the final attempt', () => {
  beforeEach(() => {
    h.sendGenericEmail.mockResolvedValue({ success: false, error: 'provider 503' });
  });

  it('confirmation, attempt 1 of 3 → NO failure recorded (it will be retried)', async () => {
    await expect(handleRegistrationConfirmationJob(CONFIRMATION, NOT_FINAL)).rejects.toThrow();
    // 13-21 built this counter to PAGE an operator. A paging counter that fires on a recoverable
    // event is a counter the operator learns to ignore.
    expect(h.recordAutoSendFailure).not.toHaveBeenCalled();
  });

  it('confirmation, FINAL attempt → EXACTLY ONE failure recorded', async () => {
    await expect(handleRegistrationConfirmationJob(CONFIRMATION, FINAL)).rejects.toThrow();
    expect(h.recordAutoSendFailure).toHaveBeenCalledTimes(1);
    expect(h.recordAutoSendFailure).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'confirmation', respondentId: 'r1' }),
    );
  });

  it('thank-you, attempt 1 of 3 → NO failure recorded', async () => {
    await expect(handleRegistrationThankYouJob(THANKYOU, NOT_FINAL)).rejects.toThrow();
    expect(h.recordAutoSendFailure).not.toHaveBeenCalled();
  });

  it('thank-you, FINAL attempt → EXACTLY ONE failure recorded', async () => {
    await expect(handleRegistrationThankYouJob(THANKYOU, FINAL)).rejects.toThrow();
    expect(h.recordAutoSendFailure).toHaveBeenCalledTimes(1);
    expect(h.recordAutoSendFailure).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'thankyou', respondentId: 'r1' }),
    );
  });
});

// ── §4(a) — the transient 5xx that used to be lost forever ─────────────────

describe('the send THROWS on failure, so BullMQ retries', () => {
  it('confirmation throws on a provider failure (it used to `return` and vanish)', async () => {
    h.sendGenericEmail.mockResolvedValue({ success: false, error: 'provider 503' });
    await expect(handleRegistrationConfirmationJob(CONFIRMATION, NOT_FINAL)).rejects.toThrow(/503/);
  });

  it('thank-you throws on a provider failure', async () => {
    h.sendGenericEmail.mockResolvedValue({ success: false, error: 'provider 503' });
    await expect(handleRegistrationThankYouJob(THANKYOU, NOT_FINAL)).rejects.toThrow(/503/);
  });

  it('does NOT stamp the send-once marker when the send failed', async () => {
    h.sendGenericEmail.mockResolvedValue({ success: false, error: 'provider 503' });
    await expect(handleRegistrationThankYouJob(THANKYOU, FINAL)).rejects.toThrow();
    expect(h.execute).not.toHaveBeenCalled();
  });
});

// ── 13-46 AC2 — a cap refusal is a DECISION, not a fault ──────────────────

describe('a marketing cap refusal neither pages nor retries', () => {
  beforeEach(() => {
    h.sendGenericEmail.mockResolvedValue({ success: false, refusedByCap: true, error: 'Marketing send cap reached' });
  });

  it('does NOT throw — retrying against a DAILY ceiling would just burn all three attempts', async () => {
    await expect(handleRegistrationThankYouJob(THANKYOU, FINAL)).resolves.toBeUndefined();
  });

  it('does NOT record an auto-send failure (13-46 review A2 — wrong diagnosis at the worst moment)', async () => {
    await handleRegistrationThankYouJob(THANKYOU, FINAL);
    expect(h.recordAutoSendFailure).not.toHaveBeenCalled();
  });

  it('does NOT stamp the marker, so the send can be re-driven once the cap clears', async () => {
    await handleRegistrationThankYouJob(THANKYOU, FINAL);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('does NOT count a burst auto-send — it counts SENDS, not intentions', async () => {
    await handleRegistrationThankYouJob(THANKYOU, FINAL);
    expect(h.recordRegistrationAutoSend).not.toHaveBeenCalled();
  });
});

// ── AC3 — transactional stays transactional ───────────────────────────────

describe('AC3 — category discipline is preserved through the move', () => {
  it('the confirmation passes NO category — a reference code is not marketing', async () => {
    await handleRegistrationConfirmationJob(CONFIRMATION, NOT_FINAL);
    // A marketing category here would put a citizen's own registration code behind 13-46's
    // marketing throttle and into `campaign_sends`, where the 5-day gap would then suppress it.
    expect(h.sendGenericEmail).toHaveBeenCalledTimes(1);
    expect(h.sendGenericEmail.mock.calls[0]).toHaveLength(1);
  });

  it('the thank-you keeps category `thankyou-referral` and campaign `thankyou-referral-auto`', async () => {
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.sendGenericEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 't@x.test' }),
      'thankyou-referral',
      'thankyou-referral-auto',
    );
  });
});

// ── AC2 — the guard block runs IN THE HANDLER, in its original order ──────

describe('AC2 — every guard is re-evaluated here, immediately before the send', () => {
  it('the send-once marker stops a retry dead — provider called ZERO times', async () => {
    h.findFirst.mockResolvedValue({
      source: 'public',
      firstName: 'Ada',
      metadata: { thankyou_referral_sent_at: '2026-08-22T10:00:00.000Z' },
    });
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.sendGenericEmail).not.toHaveBeenCalled();
  });

  it('the confirmation marker stops a retry dead too', async () => {
    h.findFirst.mockResolvedValue({ metadata: { confirmation_email_sent_at: '2026-08-22T10:00:00.000Z' } });
    await handleRegistrationConfirmationJob(CONFIRMATION, NOT_FINAL);
    expect(h.sendGenericEmail).not.toHaveBeenCalled();
  });

  it('the source gate still holds — a non-public respondent gets no referral ask', async () => {
    h.findFirst.mockResolvedValue({ source: 'enumerator', firstName: 'Ada', metadata: null });
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.sendGenericEmail).not.toHaveBeenCalled();
  });

  it('suppression still holds', async () => {
    h.getSuppressedEmails.mockResolvedValue(new Set(['t@x.test']));
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.sendGenericEmail).not.toHaveBeenCalled();
  });

  it('the 5-day per-address gap is READ IN THE WORKER — the window is evaluated at SEND time', async () => {
    // 🔴 This is the trap AC2 names: evaluate a TIME window at enqueue and dispatch from a backlog
    // ten minutes later, and the gate approved a send outside the window it measured.
    h.getRecentlyContactedEmails.mockResolvedValue(new Set(['t@x.test']));
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.sendGenericEmail).not.toHaveBeenCalled();
    expect(h.recordThankYouSuppressed).toHaveBeenCalledTimes(1);
  });

  it('asks the ledger ONLY about the thank-you category (13-46 review A3)', async () => {
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.getRecentlyContactedEmails).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      expect.objectContaining({ categories: ['thankyou-referral'] }),
    );
  });

  it('FAILS OPEN when the gap read throws — the decided direction, preserved through the move', async () => {
    h.getRecentlyContactedEmails.mockRejectedValue(new Error('connection terminated unexpectedly'));
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.sendGenericEmail).toHaveBeenCalledTimes(1);
  });

  it('counts the burst auto-send AFTER a confirmed dispatch, and stamps the marker', async () => {
    await handleRegistrationThankYouJob(THANKYOU, NOT_FINAL);
    expect(h.recordRegistrationAutoSend).toHaveBeenCalledTimes(1);
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
});

// ── AC1 — the magic link: token minted on the request, only the SEND queued ──

describe('AC1 — the pending-NIN magic-link handler', () => {
  it('sends the ALREADY-ISSUED token and never mints one', async () => {
    await handleRegistrationMagicLinkJob({
      respondentId: 'r1',
      email: 'm@x.test',
      tokenPlaintext: 'tok-123',
      purpose: 'pending_nin_complete',
      expiresAt: '2026-08-25T10:00:00.000Z',
    });
    expect(h.sendMagicLinkEmail).toHaveBeenCalledWith({
      email: 'm@x.test',
      tokenPlaintext: 'tok-123',
      purpose: 'pending_nin_complete',
      expiresAt: new Date('2026-08-25T10:00:00.000Z'),
    });
  });
});

describe('a THROWN failure counts too (13-65 review B3 / finding H4)', () => {
  /**
   * ⚠️ 13-21's counter pages after 5 failures with "the confirmation + thank-you/referral loop may
   * be down". Before this fix it was reachable only from inside `if (!result.success)`, so a failure
   * of the respondents lookup, of the suppression service, of template building — or a provider
   * client that THROWS instead of returning `{success:false}` — never counted. That is exactly the
   * burst-day failure mode the counter exists for, and the old test for it was deleted in the move
   * without an equivalent replacement. These are that replacement.
   */

  it('routes a THROWN confirmation failure through the failure counter on the final attempt', async () => {
    h.findFirst.mockRejectedValue(new Error('remaining connection slots are reserved'));

    await expect(
      handleRegistrationConfirmationJob(CONFIRMATION, FINAL),
    ).rejects.toThrow(/remaining connection slots/);

    expect(h.recordAutoSendFailure).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'confirmation' }),
    );
  });

  it('routes a THROWN thank-you failure through the failure counter on the final attempt', async () => {
    h.findFirst.mockRejectedValue(new Error('email-events service unavailable'));

    await expect(
      handleRegistrationThankYouJob(THANKYOU, FINAL),
    ).rejects.toThrow(/email-events service unavailable/);

    expect(h.recordAutoSendFailure).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'thankyou' }),
    );
  });

  it('does NOT count a thrown failure on a NON-final attempt — a recoverable 5xx must not page', async () => {
    // AC6's rule, unchanged: only the final attempt counts, so a transient error that succeeds on
    // retry never reaches the pager.
    h.findFirst.mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      handleRegistrationThankYouJob(THANKYOU, NOT_FINAL),
    ).rejects.toThrow(/ECONNRESET/);

    expect(h.recordAutoSendFailure).not.toHaveBeenCalled();
  });

  it('always RE-THROWS so BullMQ retry/backoff is untouched', async () => {
    h.findFirst.mockRejectedValue(new Error('boom'));

    await expect(
      handleRegistrationConfirmationJob(CONFIRMATION, FINAL),
    ).rejects.toThrow(/boom/);
  });
});

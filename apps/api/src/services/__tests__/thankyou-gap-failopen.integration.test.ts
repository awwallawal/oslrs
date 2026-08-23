import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { like, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

/**
 * Story 13-46 (review A9 / finding M6) — THE FAIL-OPEN BRANCH THAT HAD NO TEST.
 *
 * AC2 required the fail-soft-ledger direction to be DECIDED AND RECORDED, and it was: a ledger read
 * that fails ALLOWS the send, because the alternative turns degraded instrumentation into total loss
 * of a citizen-facing email, and the residual risk is bounded by AC1's cap (which reads Redis, not
 * this ledger). The reviewer's finding: that deliberately-chosen direction was the single branch in
 * the whole story with no test — deleting the entire `try/catch` would not have reddened the suite.
 *
 * `getRecentlyContactedEmails` is mocked to REJECT for this file only. Everything else — the
 * respondent lookup, the send path, the provider — is real, so this exercises the actual branch
 * rather than a re-implementation of it.
 *
 * ─── SETUP CHANGED BY STORY 13-65; EVERY ASSERTION IS UNCHANGED ───
 * The fail-open branch moved, verbatim, into the worker handler
 * (`services/registration-email-jobs.ts:handleRegistrationThankYouJob`), because a TIME window
 * evaluated at enqueue and a send executed from a backlog minutes later is a guard that did not
 * run. The driver moved with it. The assertions did not: delete the try/catch and the first test
 * below still reddens, which is the only property this file was ever worth having for.
 */
const NOT_FINAL = { isFinalAttempt: false };

/** The 13-46 chain, driven where 13-65 put it. */
const drive = (respondentId: string, email: string) =>
  handleRegistrationThankYouJob({ respondentId, email }, NOT_FINAL);
const { mockGapRead } = vi.hoisted(() => ({ mockGapRead: vi.fn() }));

/**
 * Story 13-65 - the producers, spied. `isTestMode()` makes the real ones return `'test-job-id'`
 * without touching Redis, so an integration test cannot observe a real enqueue; the story's own
 * Testing Standards say to assert on the mocked producer or drive the processor directly. This file
 * does BOTH, and JOINS them: it asserts the payload the request path enqueues, then feeds THAT
 * payload to the worker handler and asserts the provider send. Neither half alone would prove the
 * chain still reaches a citizen.
 */
const { mockQueueThankYou, mockQueueConfirmation } = vi.hoisted(() => ({
  mockQueueThankYou: vi.fn(),
  mockQueueConfirmation: vi.fn(),
}));
vi.mock('../../queues/email.queue.js', () => ({
  queueRegistrationThankYouEmail: (...a: unknown[]) => mockQueueThankYou(...a),
  queueRegistrationConfirmationEmail: (...a: unknown[]) => mockQueueConfirmation(...a),
}));

vi.mock('../campaign-contact.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../campaign-contact.service.js')>();
  return {
    ...actual,
    getRecentlyContactedEmails: (...args: unknown[]) => mockGapRead(...args),
  };
});

import { db } from '../../db/index.js';
import { respondents, campaignSends } from '../../db/schema/index.js';
import { SubmissionProcessingService } from '../submission-processing.service.js';
import { handleRegistrationThankYouJob } from '../registration-email-jobs.js';
import { EmailService } from '../email.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';

const DOMAIN = '@gapfail.test';
const REF_PREFIX = '13-46-GAPFAIL-';

async function cleanup(): Promise<void> {
  await db.delete(campaignSends).where(like(campaignSends.email, `%${DOMAIN}`));
  await db.delete(respondents).where(like(respondents.referenceCode, `${REF_PREFIX}%`));
}

async function seedPublicRespondent(ref: string): Promise<string> {
  const id = uuidv7();
  await db.insert(respondents).values({
    id,
    referenceCode: `${REF_PREFIX}${ref}`,
    firstName: 'Gap',
    lastName: ref,
    phoneNumber: '+2348000000099',
    status: 'active',
    source: 'public',
  });
  return id;
}

const sent = () => getMockEmailProvider().getSentEmails();

describe('AC2 fail-open on a degraded ledger (13-46 review A9) — real DB', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(async () => {
    await cleanup();
    resetMockEmailProvider();
    EmailService.initialize();
    mockGapRead.mockReset();
  });

  it('SENDS when the contact-gap read THROWS — the decided direction, finally exercised', async () => {
    mockGapRead.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const id = await seedPublicRespondent('throws');

    await drive(id, `throws${DOMAIN}`);

    // Delete the try/catch in `sendThankYouReferralEmail` and this test fails — which is the only
    // property worth having, and the one that was missing.
    expect(sent()).toHaveLength(1);
  });

  it('still SUPPRESSES normally when the read SUCCEEDS and reports a recent thank-you', async () => {
    // The converse direction, so "fail-open" cannot be achieved by simply never suppressing.
    mockGapRead.mockResolvedValue(new Set([`suppressed${DOMAIN}`]));
    const id = await seedPublicRespondent('suppressed');

    await drive(id, `suppressed${DOMAIN}`);

    expect(sent()).toHaveLength(0);
  });

  it('asks the ledger ONLY about the thank-you category (review A3 / finding H3)', async () => {
    mockGapRead.mockResolvedValue(new Set<string>());
    const id = await seedPublicRespondent('scoped');

    await drive(id, `scoped${DOMAIN}`);

    // A broad read here is what silently dropped a thank-you for anyone a DIFFERENT campaign had
    // touched inside the window.
    expect(mockGapRead).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      expect.objectContaining({ categories: ['thankyou-referral'] }),
    );
  });

  it('does NOT stamp the send-once marker when the gap suppressed the send', async () => {
    // Otherwise a suppression would be permanent even after the gap expires.
    mockGapRead.mockResolvedValue(new Set([`nomark${DOMAIN}`]));
    const id = await seedPublicRespondent('nomark');

    await drive(id, `nomark${DOMAIN}`);

    const row = await db.query.respondents.findFirst({ where: eq(respondents.id, id) });
    const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.thankyou_referral_sent_at).toBeUndefined();
  });
});

describe('AC8 — the REAL post-submission chain reaches the provider (13-46 review A9)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(async () => {
    await cleanup();
    resetMockEmailProvider();
    EmailService.initialize();
    mockGapRead.mockReset();
    mockGapRead.mockResolvedValue(new Set<string>());
    mockQueueThankYou.mockReset();
    mockQueueThankYou.mockResolvedValue('test-job-id');
    mockQueueConfirmation.mockReset();
    mockQueueConfirmation.mockResolvedValue('test-job-id');
  });

  /**
   * 13-46 AC8 asked for the RED-verify to be driven through `runPostSubmissionSideEffects`, one
   * level above `sendRegistrationAutoEmails`, and asserted a real provider send at the end of it.
   *
   * STORY 13-65 SPLIT THAT CHAIN IN TWO, AND THIS TEST FOLLOWS THE SPLIT RATHER THAN WEAKENING.
   * `runPostSubmissionSideEffects` now ENQUEUES; the worker handler sends. Asserting only "it
   * enqueued" would be strictly weaker than what 13-46 had - a job that enqueues and never sends is
   * exactly the [[pattern-ship-a-fix-that-never-fires]] shape. So the test does both halves and
   * JOINS them: it takes the payload the request path actually enqueued and feeds THAT payload to
   * the handler. If the payload were wrong, or the handler could not act on it, this reddens.
   *
   * That entrypoint AWAITS the enqueue (13-65) (deliberately - a slow enqueue must never delay a
   * committed registration), so the first half has to wait for a fire-and-forget tail. Bounded
   * polling, not a sleep: every dependency here resolves immediately. ONE `setImmediate` is not
   * enough and gives false greens on negative assertions.
   */
  async function waitForEnqueue(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (mockQueueThankYou.mock.calls.length > 0) return;
      await new Promise((r) => setImmediate(r));
    }
  }

  it('drives runPostSubmissionSideEffects to an ENQUEUE, and that payload to a real provider send', async () => {
    const id = await seedPublicRespondent('chain');

    await SubmissionProcessingService.runPostSubmissionSideEffects({
      respondentId: id,
      submissionId: uuidv7(),
      email: `chain${DOMAIN}`,
      status: 'active',
      isNew: false,
      consentMarketplace: false,
    });
    await waitForEnqueue();

    // Half 1 - the request path handed the queue IDENTIFIERS, not a rendered email.
    expect(mockQueueThankYou).toHaveBeenCalledTimes(1);
    const payload = mockQueueThankYou.mock.calls[0][0] as { respondentId: string; email: string };
    expect(payload).toEqual({ respondentId: id, email: `chain${DOMAIN}` });
    expect(payload).not.toHaveProperty('html');
    expect(sent()).toHaveLength(0); // nothing was dialled on the request

    // Half 2 - the worker acts on exactly that payload and a real email leaves.
    await handleRegistrationThankYouJob(payload, NOT_FINAL);

    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe(`chain${DOMAIN}`);
  });

  it('AC6 - an enqueue that REJECTS SURFACES to the caller, so the operator page can fire', async () => {
    /**
     * Story 13-65 (AC6) - THE DIRECTION HERE IS DELIBERATE AND WAS GOT WRONG ONCE.
     *
     * The first version of this change left the auto-email fan-out `void`-ed inside
     * `runPostSubmissionSideEffects`. That was correct while the emails DIALLED a provider, but an
     * enqueue that rejects (Redis down during a jingle) then becomes an UNHANDLED REJECTION that
     * the caller cannot see - and the wizard's one-shot Telegram page, whose entire job is to make
     * exactly that outage loud, could never fire. The suite surfaced it as an unhandled error.
     *
     * So the enqueue is awaited and the rejection propagates. The 201 is protected at the CALL
     * SITE, not here: `registration.controller.ts` invokes this with `void ... .catch()` and pages
     * from that catch. `registration.routes.test.ts` asserts the 201 survives.
     */
    mockQueueThankYou.mockRejectedValue(new Error('redis unreachable'));
    const id = await seedPublicRespondent('rejects');

    await expect(
      SubmissionProcessingService.runPostSubmissionSideEffects({
        respondentId: id,
        submissionId: uuidv7(),
        email: `rejects${DOMAIN}`,
        status: 'active',
        isNew: false,
        consentMarketplace: false,
      }),
    ).rejects.toThrow('redis unreachable');
  });
});

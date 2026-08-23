import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 13-65 — THE EMAIL WORKER. There was no test file for it before this story.
 *
 * 🔴 AC4 IS THE REASON THIS FILE EXISTS. `email.worker.ts` pauses the WHOLE `email-notification`
 * queue and throws when the email budget is exhausted. Before 13-65 that was safe: a registrant's
 * magic link and reference code bypassed the queue entirely, so an exhausted MARKETING budget could
 * not touch them. Putting them ON the queue without an exemption would create a failure mode THAT
 * DOES NOT EXIST TODAY and is strictly worse than the one being cured — an exhausted marketing
 * budget silently stopping a citizen's LOGIN LINK.
 *
 * Every assertion below is written so that DELETING the guard reddens it:
 *   - delete the `emailPriority === 'critical'` exemption → the critical tests fail (queue paused,
 *     handler never called, processor threw)
 *   - delete the `!== 'critical'` half → the CONVERSE test fails (13-46's spend control gone)
 *   - delete a registration `switch` case → the routing tests fail with "Unknown email type"
 *   - delete the `isFinalAttempt` computation → the AC6 tests fail
 *
 * Harness: the captured-processor pattern from `marketplace-extraction.worker.test.ts:1-60` —
 * `vi.mock('bullmq')` with a `MockWorker` that captures the processor so it can be invoked directly
 * with a fake job.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      capturedProcessor = processor;
    }
    on() { return this; }
    isRunning() { return true; }
    close() { return Promise.resolve(); }
  },
  Job: class MockJob {},
  Queue: class MockQueue {
    add() { return Promise.resolve({ id: 'q1' }); }
    close() { return Promise.resolve(); }
  },
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis { constructor() { /* no-op */ } },
}));

/**
 * ⚠️ Implementations are set in `beforeEach`, NEVER inside these factories.
 * `vitest.base.ts` sets `mockReset: true`, which strips an implementation written as
 * `vi.fn().mockResolvedValue(x)` in a factory before EVERY test — the stub then returns
 * `undefined` at call time and the suite goes false-green.
 */
const h = vi.hoisted(() => ({
  mockRedisExists: vi.fn(),
  mockRedisSet: vi.fn(),
  mockCheckBudget: vi.fn(),
  mockRecordSend: vi.fn(),
  mockPauseEmailQueue: vi.fn(),
  mockDeferEmail: vi.fn(),
  mockSendStaffInvitation: vi.fn(),
  mockMagicLinkHandler: vi.fn(),
  mockConfirmationHandler: vi.fn(),
  mockThankYouHandler: vi.fn(),
  mockLogAction: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
  createRedisConnection: () => ({
    exists: (...a: unknown[]) => h.mockRedisExists(...a),
    set: (...a: unknown[]) => h.mockRedisSet(...a),
    quit: () => Promise.resolve(),
  }),
  getRedisClient: vi.fn(),
  checkRedisHealth: vi.fn(),
  closeAllConnections: vi.fn(),
}));

vi.mock('../../services/email-budget.service.js', () => ({
  EmailBudgetService: class {
    checkBudget(...a: unknown[]) { return h.mockCheckBudget(...a); }
    recordSend(...a: unknown[]) { return h.mockRecordSend(...a); }
  },
}));

vi.mock('../../queues/email.queue.js', () => ({
  getBackoffDelay: (n: number) => n,
  pauseEmailQueue: (...a: unknown[]) => h.mockPauseEmailQueue(...a),
  deferEmail: (...a: unknown[]) => h.mockDeferEmail(...a),
  getDeferredRecipients: () => Promise.resolve([]),
  getDeferredEmails: () => Promise.resolve([]),
  clearDeferredEmails: () => Promise.resolve(),
}));

vi.mock('../../services/email.service.js', () => ({
  EmailService: {
    sendStaffInvitationEmail: (...a: unknown[]) => h.mockSendStaffInvitation(...a),
    sendPasswordResetEmail: vi.fn(),
    sendPaymentNotificationEmail: vi.fn(),
    sendDisputeNotificationEmail: vi.fn(),
    sendDisputeResolutionEmail: vi.fn(),
    sendGenericEmail: vi.fn(),
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: { logAction: (...a: unknown[]) => h.mockLogAction(...a) },
}));

vi.mock('../../services/registration-email-jobs.js', () => ({
  handleRegistrationMagicLinkJob: (...a: unknown[]) => h.mockMagicLinkHandler(...a),
  handleRegistrationConfirmationJob: (...a: unknown[]) => h.mockConfirmationHandler(...a),
  handleRegistrationThankYouJob: (...a: unknown[]) => h.mockThankYouHandler(...a),
}));

await import('../email.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

// ── Helpers ────────────────────────────────────────────────────────────────

const ALLOWED = {
  allowed: true,
  reason: 'ok',
  tier: 'pro',
  usage: { dailyCount: 1, dailyLimit: 1000, monthlyCount: 10, monthlyLimit: 50000 },
};
const DENIED = {
  allowed: false,
  reason: 'monthly_budget_exhausted',
  tier: 'pro',
  usage: { dailyCount: 1000, dailyLimit: 1000, monthlyCount: 50000, monthlyLimit: 50000 },
};

function makeJob(data: Record<string, unknown>, over: { attemptsMade?: number; attempts?: number } = {}) {
  return {
    id: 'job-1',
    name: data.type as string,
    data,
    attemptsMade: over.attemptsMade ?? 0,
    opts: { attempts: over.attempts ?? 3 },
  };
}

const magicLinkJob = () =>
  makeJob({
    type: 'registration-magic-link',
    userId: 'resp-1',
    priority: 'critical',
    data: { respondentId: 'resp-1', email: 'a@b.test', tokenPlaintext: 't', purpose: 'pending_nin_complete', expiresAt: new Date().toISOString() },
  });

const confirmationJob = (over?: { attemptsMade?: number; attempts?: number }) =>
  makeJob(
    {
      type: 'registration-confirmation',
      userId: 'resp-2',
      priority: 'critical',
      data: { respondentId: 'resp-2', email: 'c@b.test', referenceCode: 'OSL-2026-000001', status: 'active' },
    },
    over ?? {},
  );

const thankYouJob = (over?: { attemptsMade?: number; attempts?: number }) =>
  makeJob(
    {
      type: 'registration-thankyou',
      userId: 'resp-3',
      priority: 'standard',
      data: { respondentId: 'resp-3', email: 't@b.test' },
    },
    over ?? {},
  );

beforeEach(() => {
  h.mockRedisExists.mockResolvedValue(0);
  h.mockRedisSet.mockResolvedValue('OK');
  h.mockCheckBudget.mockResolvedValue(ALLOWED);
  h.mockRecordSend.mockResolvedValue(undefined);
  h.mockPauseEmailQueue.mockResolvedValue(undefined);
  h.mockDeferEmail.mockResolvedValue(undefined);
  h.mockSendStaffInvitation.mockResolvedValue({ success: true, messageId: 'm1' });
  h.mockMagicLinkHandler.mockResolvedValue(undefined);
  h.mockConfirmationHandler.mockResolvedValue(undefined);
  h.mockThankYouHandler.mockResolvedValue(undefined);
  h.mockLogAction.mockReturnValue(undefined);
});

// ── AC1 — the three registration types are ROUTED ──────────────────────────

describe('AC1 — the three registration sends are handled by the worker', () => {
  it('routes registration-magic-link to its handler', async () => {
    await processorFn(magicLinkJob());
    expect(h.mockMagicLinkHandler).toHaveBeenCalledTimes(1);
    expect(h.mockMagicLinkHandler).toHaveBeenCalledWith(
      expect.objectContaining({ respondentId: 'resp-1', tokenPlaintext: 't' }),
    );
  });

  it('routes registration-confirmation to its handler', async () => {
    await processorFn(confirmationJob());
    expect(h.mockConfirmationHandler).toHaveBeenCalledTimes(1);
    expect(h.mockConfirmationHandler).toHaveBeenCalledWith(
      expect.objectContaining({ referenceCode: 'OSL-2026-000001' }),
      expect.objectContaining({ isFinalAttempt: expect.any(Boolean) }),
    );
  });

  it('routes registration-thankyou to its handler', async () => {
    await processorFn(thankYouJob());
    expect(h.mockThankYouHandler).toHaveBeenCalledTimes(1);
  });

  it('an unknown type still throws — the switch has not been made permissive', async () => {
    await expect(processorFn(makeJob({ type: 'not-a-real-type', userId: 'u', data: {} }))).rejects.toThrow(
      /Unknown email type/,
    );
  });
});

// ── AC4 — 🔴 the red line ──────────────────────────────────────────────────

describe('AC4 — budget exhaustion must not be able to stop a citizen transactional email', () => {
  beforeEach(() => {
    h.mockCheckBudget.mockResolvedValue(DENIED);
  });

  it('a CRITICAL magic-link job still dispatches with the budget exhausted', async () => {
    await expect(processorFn(magicLinkJob())).resolves.toBeTruthy();
    expect(h.mockMagicLinkHandler).toHaveBeenCalledTimes(1);
  });

  it('does NOT pause the queue for a critical magic-link job', async () => {
    await processorFn(magicLinkJob());
    // Remove the exemption and this is the assertion that reddens: today an exhausted MARKETING
    // budget would take the whole queue — and every citizen login link with it — offline.
    expect(h.mockPauseEmailQueue).not.toHaveBeenCalled();
  });

  it('a CRITICAL reference-code confirmation also proceeds and does not pause', async () => {
    await expect(processorFn(confirmationJob())).resolves.toBeTruthy();
    expect(h.mockConfirmationHandler).toHaveBeenCalledTimes(1);
    expect(h.mockPauseEmailQueue).not.toHaveBeenCalled();
  });

  it('THE CONVERSE — a STANDARD thank-you under the same denial still THROWS (the spend control)', async () => {
    // 13-46's spend control is intact. Without this the exemption could be widened to everything
    // and the suite would stay green.
    await expect(processorFn(thankYouJob())).rejects.toThrow(/Budget exhausted/);
    expect(h.mockThankYouHandler).not.toHaveBeenCalled();
  });

  it('THE CONVERSE — a STANDARD non-registration job is unchanged too', async () => {
    const job = makeJob({
      type: 'backup-notification',
      userId: 'system',
      priority: 'standard',
      data: { to: 'ops@b.test', subject: 's', html: 'h', text: 't' },
    });
    await expect(processorFn(job)).rejects.toThrow(/Budget exhausted/);
  });

  /**
   * ⚖️ Story 13-65 (review C6 / finding R5) — A SCOPE CHANGE, DECIDED AND RECORDED.
   *
   * `staff-invitation` and `password-reset` were already `critical` in `EMAIL_TYPE_PRIORITY`, but
   * before AC4 there was NO exemption: budget exhaustion paused the queue and threw for every type,
   * so those two were blocked too. AC4's exemption newly un-gates them — a registration story
   * changing unrelated mail.
   *
   * KEPT, deliberately: the budget is a SPEND guard, and a password reset is someone locked out of
   * their account. Blocking it to save a fraction of a cent is the same wrong trade this story
   * rejects for the magic link. Volume is governed by 13-46's marketing cap, which is the control
   * that should govern it.
   *
   * ⚠️ These assert the BUDGET decision only. Their senders are not stubbed in this harness, so the
   * job may still fail further down the switch — irrelevant here. The property under test is that
   * budget exhaustion did NOT stop it, which is precisely "does not throw Budget exhausted".
   */
  it.each(['password-reset', 'staff-invitation'] as const)(
    'does NOT refuse %s on an exhausted budget (review C6)',
    async (type) => {
      const job = makeJob({ type, userId: 'u1', data: { email: 'x@b.test' } });

      // One of these two has a stubbed sender and resolves; the other does not and rejects further
      // down the switch. Either is fine — the property under test is only that the BUDGET did not
      // refuse it, so assert on the error text rather than on resolve/reject.
      let thrown: unknown;
      try {
        await processorFn(job);
      } catch (err) {
        thrown = err;
      }

      expect(String(thrown ?? '')).not.toMatch(/Budget exhausted/);
      expect(h.mockPauseEmailQueue).not.toHaveBeenCalled();
    },
  );

  it('🔴 NEVER pauses the queue — for ANY job type, critical or standard (review B1 / finding H1)', async () => {
    /**
     * ⚠️ THE REGRESSION GUARD FOR THE WORST DEFECT IN THIS STORY.
     *
     * `pauseEmailQueue()` calls BullMQ's `Queue.pause()`, which is GLOBAL: it renames the wait list
     * and every job added afterwards goes to the PAUSED list instead. The `critical` exemption could
     * therefore only ever help a job the worker had ALREADY picked up — so an exhausted MARKETING
     * budget still stopped every subsequent citizen LOGIN LINK, durably (the flag lives in Redis and
     * survives restart + deploy) with manual-only recovery.
     *
     * The previous test could not see it: this harness captures the PROCESSOR, not a queue, so
     * "the queue was not paused for THIS job" was the only assertable thing —
     * [[pattern-test-that-passes-over-a-hole]] inside the AC that names that pattern.
     *
     * The fix removed the auto-pause entirely, which makes the defect impossible rather than
     * narrow — and that IS assertable from this harness: the function is never invoked at all.
     */
    await expect(processorFn(thankYouJob())).rejects.toThrow(/Budget exhausted/);
    await expect(processorFn(magicLinkJob())).resolves.toBeTruthy();
    await expect(processorFn(confirmationJob())).resolves.toBeTruthy();
    await expect(
      processorFn(
        makeJob({
          type: 'backup-notification',
          userId: 'system',
          priority: 'standard',
          data: { to: 'ops@b.test', subject: 's', html: 'h', text: 't' },
        }),
      ),
    ).rejects.toThrow(/Budget exhausted/);

    expect(h.mockPauseEmailQueue).not.toHaveBeenCalled();
  });

  it('falls back to EMAIL_TYPE_PRIORITY when the job record carries no explicit priority', async () => {
    // Old job records enqueued before this story, and any producer that forgets to set it.
    const job = makeJob({
      type: 'registration-magic-link',
      userId: 'resp-1',
      data: { respondentId: 'resp-1', email: 'a@b.test', tokenPlaintext: 't', purpose: 'pending_nin_complete', expiresAt: new Date().toISOString() },
    });
    await expect(processorFn(job)).resolves.toBeTruthy();
    expect(h.mockPauseEmailQueue).not.toHaveBeenCalled();
  });
});

// ── AC3/AC4 — the >=80% deferral still sheds only `standard` ───────────────

describe('AC3 — the >=80%-budget deferral can never shed a critical registration send', () => {
  beforeEach(() => {
    h.mockCheckBudget.mockResolvedValue({
      ...ALLOWED,
      usage: { dailyCount: 990, dailyLimit: 1000, monthlyCount: 10, monthlyLimit: 50000 },
    });
  });

  it('does NOT defer registration-magic-link', async () => {
    await processorFn(magicLinkJob());
    expect(h.mockDeferEmail).not.toHaveBeenCalled();
    expect(h.mockMagicLinkHandler).toHaveBeenCalledTimes(1);
  });

  it('does NOT defer registration-confirmation', async () => {
    await processorFn(confirmationJob());
    expect(h.mockDeferEmail).not.toHaveBeenCalled();
    expect(h.mockConfirmationHandler).toHaveBeenCalledTimes(1);
  });

  it('🔴 NEVER defers a citizen registration send into the ops digest (review B2 / finding H2)', async () => {
    /**
     * ⚠️ THIS TEST ASSERTED THE BUG. It previously required the thank-you to be deferred, which is
     * exactly the regression: the deferral returns BEFORE the type switch, so the `source='public'`
     * gate, the 13-9 suppression check, 13-46's 5-day per-address gap, the send-once marker and the
     * burst counter were ALL skipped — every guard this story moved into the handler.
     *
     * What the citizen actually received was the ops digest: "[OSLRS] You have 1 notification",
     * carrying the thank-you line, sent with NO category. That classifies as `notification-digest`,
     * so: no List-Unsubscribe header, no marketing cap, no `campaign_sends` row — marketing mail
     * laundered into an ops category, deliverable to an address on the bounce / complaint /
     * UNSUBSCRIBE list. And it returned `{success: true, deferred: true}`, so nothing retried and
     * nothing was counted lost. The real thank-you was simply never sent.
     *
     * The deferral/digest mechanism is for OPS/STAFF notifications. Marketing VOLUME is governed by
     * 13-46's cap, consulted per-send inside `dispatch` — category-aware, loud, with its own page.
     */
    const res = (await processorFn(thankYouJob())) as { deferred?: boolean };

    expect(res.deferred).toBeUndefined();
    expect(h.mockDeferEmail).not.toHaveBeenCalled();
    expect(h.mockThankYouHandler).toHaveBeenCalledTimes(1);
  });

  it('STILL defers a genuine ops/staff standard job — the mechanism is not disabled', async () => {
    // The converse, so "never defers" cannot be achieved by breaking deferral for everything.
    const job = makeJob({
      type: 'backup-notification',
      userId: 'system',
      priority: 'standard',
      data: { to: 'ops@b.test', subject: 's', html: 'h', text: 't' },
    });

    const res = (await processorFn(job)) as { deferred?: boolean };

    expect(res.deferred).toBe(true);
    expect(h.mockDeferEmail).toHaveBeenCalledTimes(1);
  });
});

// ── AC6 — the final-attempt flag the handlers gate their paging counter on ──

describe('AC6 — the handler is told whether this is the FINAL attempt', () => {
  it('attempt 1 of 3 → isFinalAttempt false', async () => {
    await processorFn(confirmationJob({ attemptsMade: 0, attempts: 3 }));
    expect(h.mockConfirmationHandler).toHaveBeenCalledWith(expect.anything(), { isFinalAttempt: false });
  });

  it('attempt 2 of 3 → isFinalAttempt false', async () => {
    await processorFn(confirmationJob({ attemptsMade: 1, attempts: 3 }));
    expect(h.mockConfirmationHandler).toHaveBeenCalledWith(expect.anything(), { isFinalAttempt: false });
  });

  it('attempt 3 of 3 → isFinalAttempt TRUE', async () => {
    await processorFn(confirmationJob({ attemptsMade: 2, attempts: 3 }));
    expect(h.mockConfirmationHandler).toHaveBeenCalledWith(expect.anything(), { isFinalAttempt: true });
  });

  it('a handler throw propagates so BullMQ retries', async () => {
    h.mockThankYouHandler.mockRejectedValue(new Error('provider 503'));
    await expect(processorFn(thankYouJob())).rejects.toThrow('provider 503');
  });
});

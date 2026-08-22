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
 */
const { mockGapRead } = vi.hoisted(() => ({ mockGapRead: vi.fn() }));

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

    await SubmissionProcessingService.sendRegistrationAutoEmails({
      respondentId: id,
      email: `throws${DOMAIN}`,
      isNew: false,
    });

    // Delete the try/catch in `sendThankYouReferralEmail` and this test fails — which is the only
    // property worth having, and the one that was missing.
    expect(sent()).toHaveLength(1);
  });

  it('still SUPPRESSES normally when the read SUCCEEDS and reports a recent thank-you', async () => {
    // The converse direction, so "fail-open" cannot be achieved by simply never suppressing.
    mockGapRead.mockResolvedValue(new Set([`suppressed${DOMAIN}`]));
    const id = await seedPublicRespondent('suppressed');

    await SubmissionProcessingService.sendRegistrationAutoEmails({
      respondentId: id,
      email: `suppressed${DOMAIN}`,
      isNew: false,
    });

    expect(sent()).toHaveLength(0);
  });

  it('asks the ledger ONLY about the thank-you category (review A3 / finding H3)', async () => {
    mockGapRead.mockResolvedValue(new Set<string>());
    const id = await seedPublicRespondent('scoped');

    await SubmissionProcessingService.sendRegistrationAutoEmails({
      respondentId: id,
      email: `scoped${DOMAIN}`,
      isNew: false,
    });

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

    await SubmissionProcessingService.sendRegistrationAutoEmails({
      respondentId: id,
      email: `nomark${DOMAIN}`,
      isNew: false,
    });

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
  });

  /**
   * AC8 asks for the RED-verify to be driven through `runPostSubmissionSideEffects`, one level
   * above `sendRegistrationAutoEmails`. That entrypoint fires the emails with `void` (deliberately —
   * a slow provider must never delay a committed registration), so the assertion has to wait for a
   * fire-and-forget tail. Bounded polling, not a sleep: every dependency here resolves immediately.
   */
  async function waitForSend(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (sent().length > 0) return;
      await new Promise((r) => setImmediate(r));
    }
  }

  it('drives runPostSubmissionSideEffects end to end into a real provider send', async () => {
    const id = await seedPublicRespondent('chain');

    await SubmissionProcessingService.runPostSubmissionSideEffects({
      respondentId: id,
      submissionId: uuidv7(),
      email: `chain${DOMAIN}`,
      status: 'active',
      isNew: false,
      consentMarketplace: false,
    });
    await waitForSend();

    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe(`chain${DOMAIN}`);
  });
});

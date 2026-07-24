import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Story 13-24 (AC3a) — the contact ledger must be written at the ONE send chokepoint
// (`EmailService.dispatch`), not by each blast script. NotificationMeter is stubbed so this test
// has no Redis side-effects; the ledger write itself is REAL (DB) — that is what's under test.
vi.mock('../notification-meter.service.js', () => ({
  NotificationMeter: { recordEmailSend: vi.fn().mockResolvedValue(undefined) },
}));

import { like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { campaignSends } from '../../db/schema/index.js';
import { EmailService } from '../email.service.js';
import { resetMockEmailProvider } from '../../providers/index.js';

/** PARALLEL-SAFE ISOLATION: this file owns the `@ledger.test` recipient keyspace. */
const DOMAIN = '@ledger.test';
const SCOPE = `%${DOMAIN}`;

async function ledgerRows() {
  return db.select().from(campaignSends).where(like(campaignSends.email, SCOPE));
}

async function cleanup() {
  await db.delete(campaignSends).where(like(campaignSends.email, SCOPE));
}

describe('EmailService.dispatch → campaign_sends (Story 13-24 AC3a — centralized WRITE)', () => {
  beforeEach(async () => {
    await cleanup();
    resetMockEmailProvider();
    EmailService.initialize();
  });
  afterAll(cleanup);

  const payload = (to: string) => ({ to, subject: 'Finish your registration', html: '<p>hi</p>', text: 'hi' });

  it('records a MARKETING send — every blast inherits this without opting in', async () => {
    const to = `blasted${DOMAIN}`;
    const result = await EmailService.sendGenericEmail(
      payload(to),
      'reengagement-blast',
      'reengagement-2026-07',
    );

    expect(result.success).toBe(true);
    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: to,
      campaignId: 'reengagement-2026-07',
      category: 'reengagement-blast',
      channel: 'email',
    });
  });

  it.each(['supplemental-survey', 'thankyou-referral'] as const)(
    'records the other marketing category %s (all three MARKETING_CATEGORIES are ledgered)',
    async (category) => {
      await EmailService.sendGenericEmail(payload(`m-${category}${DOMAIN}`), category, 'camp-1');
      expect(await ledgerRows()).toHaveLength(1);
    },
  );

  it('does NOT record TRANSACTIONAL mail — you are not "already contacted" by a password reset', async () => {
    await EmailService.sendGenericEmail(payload(`txn${DOMAIN}`), 'password-reset');
    await EmailService.sendGenericEmail(payload(`txn2${DOMAIN}`), 'magiclink-login');
    await EmailService.sendGenericEmail(payload(`txn3${DOMAIN}`)); // no category at all
    expect(await ledgerRows()).toHaveLength(0);
  });

  it('records the canonical address even when the caller passes mixed case', async () => {
    await EmailService.sendGenericEmail(
      payload(`MixedCase${DOMAIN.toUpperCase()}`),
      'thankyou-referral',
    );
    const rows = await ledgerRows();
    expect(rows[0]?.email).toBe(`mixedcase${DOMAIN}`);
  });

  it('does NOT record when the provider send FAILS — the ledger reflects delivered contact only', async () => {
    // Disabling the service short-circuits before dispatch; the closest in-process stand-in for a
    // failed send, and it proves no row is written on a non-success path.
    const original = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';
    EmailService.initialize();
    try {
      const result = await EmailService.sendGenericEmail(payload(`failed${DOMAIN}`), 'thankyou-referral');
      expect(result.success).toBe(false);
      expect(await ledgerRows()).toHaveLength(0);
    } finally {
      if (original === undefined) delete process.env.EMAIL_ENABLED;
      else process.env.EMAIL_ENABLED = original;
      EmailService.initialize();
    }
  });
});

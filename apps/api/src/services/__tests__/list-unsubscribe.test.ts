import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// NotificationMeter stubbed so the EmailService threading test has no DB/redis side-effects
// (mirrors email-campaign-tag.test.ts).
vi.mock('../notification-meter.service.js', () => ({
  NotificationMeter: { recordEmailSend: vi.fn().mockResolvedValue(undefined) },
}));

import { buildListUnsubscribeHeaders, isMarketingCategory } from '../list-unsubscribe.js';
import { verifyUnsubscribeToken } from '../unsubscribe-token.js';
import { EmailService } from '../email.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';

const SECRET = 'test-unsubscribe-secret-13-13';

describe('buildListUnsubscribeHeaders (Story 13-13 AC3/AC4) — PURE', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it.each(['reengagement-blast', 'supplemental-survey', 'thankyou-referral'] as const)(
    'marketing category %s → both headers, https link carries a token decoding back to the recipient',
    (category) => {
      const headers = buildListUnsubscribeHeaders(category, 'Lead@Example.NG');
      expect(headers).toBeDefined();
      expect(headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

      const value = headers!['List-Unsubscribe'];
      expect(value).toContain('mailto:');
      const match = value.match(/token=([^>]+)>/);
      expect(match).toBeTruthy();
      const token = decodeURIComponent(match![1]);
      expect(verifyUnsubscribeToken(token)).toEqual({ email: 'lead@example.ng' });
    },
  );

  it.each([
    'magiclink-login',
    'password-reset',
    'registration-status',
    'pending-nin-reminder',
    'health-alert-digest',
    'notification-digest',
    'staff-invitation',
    'duplicate-registration',
    'backup-success',
    undefined,
  ] as const)('transactional/ops category %s → NO headers', (category) => {
    expect(buildListUnsubscribeHeaders(category, 'x@y.ng')).toBeUndefined();
    expect(isMarketingCategory(category)).toBe(false);
  });

  it('FAIL-SOFT: missing UNSUBSCRIBE_SECRET → omits headers (does not throw)', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    expect(buildListUnsubscribeHeaders('reengagement-blast', 'x@y.ng')).toBeUndefined();
  });
});

describe('EmailService send threads List-Unsubscribe to the provider (Story 13-13 AC4)', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    resetMockEmailProvider();
    EmailService.initialize();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  const payload = { to: 'lead@example.com', subject: 'Help a friend', html: '<p>hi</p>', text: 'hi' };

  it('a MARKETING send carries List-Unsubscribe headers on the provider payload', async () => {
    await EmailService.sendGenericEmail(payload, 'thankyou-referral');
    const last = getMockEmailProvider().getLastEmail();
    expect(last?.headers?.['List-Unsubscribe']).toContain('/api/v1/unsubscribe?token=');
    expect(last?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('a TRANSACTIONAL send carries NO List-Unsubscribe headers', async () => {
    await EmailService.sendGenericEmail(payload, 'password-reset');
    expect(getMockEmailProvider().getLastEmail()?.headers).toBeUndefined();
  });
});

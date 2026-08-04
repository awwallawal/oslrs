import { describe, it, expect, beforeEach, vi } from 'vitest';

// Story 13-9 (AC5) — the campaign tag must thread through EmailService.sendGenericEmail
// → dispatch → provider.send. We assert it lands on the provider payload using the mock
// provider singleton. NotificationMeter is stubbed so the test has no DB/redis side-effects.
vi.mock('../notification-meter.service.js', () => ({
  NotificationMeter: { recordEmailSend: vi.fn().mockResolvedValue(undefined) },
}));
// Story 13-24 — dispatch() now also writes the marketing contact ledger. Stubbed here for the same
// reason the meter is: this test is about tag threading and should stay side-effect-free. The
// ledger write itself is covered by `email-campaign-ledger.test.ts`.
vi.mock('../campaign-contact.service.js', () => ({
  recordCampaignSend: vi.fn().mockResolvedValue(undefined),
}));

import { EmailService } from '../email.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';

describe('EmailService.sendGenericEmail campaign tag threading (Story 13-9 AC5)', () => {
  beforeEach(() => {
    resetMockEmailProvider();
    // Re-init so EmailService's cached provider points at the fresh mock singleton.
    EmailService.initialize();
  });

  const payload = {
    to: 'lead@example.com',
    subject: 'Finish your registration',
    html: '<p>hi</p>',
    text: 'hi',
  };

  it('forwards campaignId to the provider when supplied', async () => {
    const result = await EmailService.sendGenericEmail(payload, 'reengagement-blast', 'reengagement-2026-07');

    expect(result.success).toBe(true);
    expect(getMockEmailProvider().getLastEmail()?.campaignId).toBe('reengagement-2026-07');
  });

  /**
   * CHANGED 2026-08-04. This test previously asserted the tag stayed UNDEFINED when no
   * campaignId was supplied — i.e. it pinned the behaviour that left every transactional send
   * unattributable. `campaignId` is the tag Resend echoes on webhook events, which is how
   * `email_events.campaign_id` links a delivery or a bounce back to a send. Marketing-ness is
   * decided by `isMarketingCategory(category)` in dispatch(), NOT by this tag, so defaulting it
   * costs nothing and buys attribution.
   *
   * What the old behaviour cost: the seven adoption-correction emails sent on 2026-08-04 carry
   * no tag, so a bounce on any of them would surface only in the suppression list with no route
   * back to the send.
   */
  it('defaults the tag to the CATEGORY when no campaignId is supplied — never untagged', async () => {
    await EmailService.sendGenericEmail(payload, 'registration-status');

    expect(getMockEmailProvider().getLastEmail()?.campaignId).toBe('registration-status');
  });

  it('an explicit campaignId still wins over the category default', async () => {
    await EmailService.sendGenericEmail(payload, 'registration-status', 'draft-adoption-2026-08');

    expect(getMockEmailProvider().getLastEmail()?.campaignId).toBe('draft-adoption-2026-08');
  });

  it('stays undefined when there is no category either — nothing to attribute to', async () => {
    await EmailService.sendGenericEmail(payload);

    expect(getMockEmailProvider().getLastEmail()?.campaignId).toBeUndefined();
  });

  /**
   * THE LOAD-BEARING ONE. Tagging a transactional send must not make it look like marketing:
   * no ledger row, and therefore no effect on blast dedupe or the 5-day contact gap. If this
   * ever fails, the attribution default has leaked into send semantics.
   */
  it('tagging a TRANSACTIONAL category does not write the marketing ledger', async () => {
    const { recordCampaignSend } = await import('../campaign-contact.service.js');
    vi.mocked(recordCampaignSend).mockClear();

    await EmailService.sendGenericEmail(payload, 'registration-status');
    expect(recordCampaignSend).not.toHaveBeenCalled();

    await EmailService.sendGenericEmail(payload, 'thankyou-referral');
    expect(recordCampaignSend).toHaveBeenCalledTimes(1);
  });

  it('every category is a legal Resend tag value, so the default can never be dropped', () => {
    // resend.provider.ts:21 — an invalid tag is silently sent UNTAGGED, which would make the
    // default a no-op for exactly the categories that needed it.
    const TAG_VALUE_RE = /^[A-Za-z0-9_-]+$/;
    const categories = [
      'magiclink-login', 'magiclink-wizard-resume', 'pending-nin-reminder', 'supplemental-survey',
      'duplicate-registration', 'password-reset', 'staff-invitation', 'payment-notification',
      'dispute', 'backup-success', 'backup-FAILURE', 'health-alert-digest', 'reengagement-blast',
      'thankyou-referral', 'notification-digest', 'registration-status',
    ];
    for (const c of categories) expect(TAG_VALUE_RE.test(c)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Story 13-9 (AC5) — the campaign tag must thread through EmailService.sendGenericEmail
// → dispatch → provider.send. We assert it lands on the provider payload using the mock
// provider singleton. NotificationMeter is stubbed so the test has no DB/redis side-effects.
vi.mock('../notification-meter.service.js', () => ({
  NotificationMeter: { recordEmailSend: vi.fn().mockResolvedValue(undefined) },
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

  it('leaves campaignId undefined when not supplied', async () => {
    await EmailService.sendGenericEmail(payload, 'reengagement-blast');

    expect(getMockEmailProvider().getLastEmail()?.campaignId).toBeUndefined();
  });
});

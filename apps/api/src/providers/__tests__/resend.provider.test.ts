import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EmailContent } from '@oslsr/types';

// ── Hoisted Resend SDK mock ──────────────────────────────────────────
// Capture the payload passed to client.emails.send so we can assert the
// Story 13-9 (AC5) campaign tag mapping without a real Resend account.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

// A class (not vi.fn) so it stays a valid constructor under the base config's
// mockReset/restoreMocks; `emails.send` delegates to sendMock at CALL time, so
// resetting sendMock's behaviour per-test (below) still flows through.
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) };
  },
}));

import { ResendEmailProvider } from '../resend.provider.js';

const base: EmailContent = {
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>hi</p>',
  text: 'hi',
};

function makeProvider() {
  return new ResendEmailProvider({
    apiKey: 're_test_key',
    fromAddress: 'noreply@oyoskills.com',
    fromName: 'OSLSR',
  });
}

describe('ResendEmailProvider — campaign tag (Story 13-9 AC5)', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'msg-123' }, error: null });
  });

  it('tags the send with campaign_id when campaignId is set', async () => {
    const result = await makeProvider().send({ ...base, campaignId: 'reengagement-2026-07' });

    expect(result).toEqual({ success: true, messageId: 'msg-123' });
    const payload = sendMock.mock.calls[0][0];
    expect(payload.tags).toEqual([{ name: 'campaign_id', value: 'reengagement-2026-07' }]);
  });

  it('omits the tags key entirely when no campaignId (untagged send)', async () => {
    await makeProvider().send(base);

    const payload = sendMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('tags');
  });

  it('drops an INVALID campaignId (skips the tag) but still sends — L1', async () => {
    // A space is illegal in a Resend tag value; tagging it would 422 the whole send.
    const result = await makeProvider().send({ ...base, campaignId: 'bad campaign id' });

    expect(result).toEqual({ success: true, messageId: 'msg-123' });
    const payload = sendMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('tags'); // untagged, not rejected
  });

  it('surfaces a Resend API error without a tag side-effect', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { name: 'invalid', message: 'bad request' } });

    const result = await makeProvider().send({ ...base, campaignId: 'cohort_a_supplemental_survey' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('bad request');
    // still forwarded the tag (the failure is provider-side, not our mapping)
    expect(sendMock.mock.calls[0][0].tags).toEqual([
      { name: 'campaign_id', value: 'cohort_a_supplemental_survey' },
    ]);
  });
});

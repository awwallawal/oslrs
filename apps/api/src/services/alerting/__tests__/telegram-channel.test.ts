import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendCriticalTelegramAlert } from '../telegram-channel.js';

const fetchMock = vi.fn();
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-123';
  process.env.TELEGRAM_OPERATOR_CHAT_ID = '987654321';
  // Bypass the test-mode skip so we exercise the API-call branch
  process.env.NODE_ENV = 'production';
  delete process.env.VITEST;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe('sendCriticalTelegramAlert', () => {
  it('posts to the Telegram sendMessage endpoint with correct URL', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendCriticalTelegramAlert({
      metricKey: 'cpu',
      value: 95,
      timestamp: new Date('2026-05-01T12:00:00Z'),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottest-bot-token-123/sendMessage');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sends a JSON body with chat_id, text, and link-preview disabled', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendCriticalTelegramAlert({
      metricKey: 'memory',
      value: 91,
      timestamp: new Date('2026-05-01T12:00:00Z'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.chat_id).toBe('987654321');
    expect(body.disable_web_page_preview).toBe(true);
    expect(typeof body.text).toBe('string');
    expect(body.text).toContain('CRITICAL');
    expect(body.text).toContain('memory');
    expect(body.text).toContain('91');
    expect(body.text).toContain('2026-05-01T12:00:00.000Z');
  });

  it('includes the previousLevel when the alert is an escalation', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendCriticalTelegramAlert({
      metricKey: 'api_p95_latency',
      value: 750,
      previousLevel: 'warning',
      timestamp: new Date('2026-05-01T12:00:00Z'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('was warning');
  });

  it('skips silently when TELEGRAM_BOT_TOKEN is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await sendCriticalTelegramAlert({
      metricKey: 'cpu',
      value: 95,
      timestamp: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips silently when TELEGRAM_OPERATOR_CHAT_ID is missing', async () => {
    delete process.env.TELEGRAM_OPERATOR_CHAT_ID;

    await sendCriticalTelegramAlert({
      metricKey: 'cpu',
      value: 95,
      timestamp: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips silently in test mode (NODE_ENV=test)', async () => {
    process.env.NODE_ENV = 'test';

    await sendCriticalTelegramAlert({
      metricKey: 'cpu',
      value: 95,
      timestamp: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips silently in test mode (VITEST=true)', async () => {
    process.env.VITEST = 'true';

    await sendCriticalTelegramAlert({
      metricKey: 'cpu',
      value: 95,
      timestamp: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      sendCriticalTelegramAlert({
        metricKey: 'cpu',
        value: 95,
        timestamp: new Date(),
      }),
    ).resolves.toBeUndefined();
  });

  it('does not throw on non-2xx HTTP response (e.g. invalid token)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"ok":false,"description":"Unauthorized"}',
    });

    await expect(
      sendCriticalTelegramAlert({
        metricKey: 'cpu',
        value: 95,
        timestamp: new Date(),
      }),
    ).resolves.toBeUndefined();
  });

  it('handles queue_waiting metric keys with colons (e.g. queue_waiting:email)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendCriticalTelegramAlert({
      metricKey: 'queue_waiting:email',
      value: 215,
      timestamp: new Date(),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('queue_waiting:email');
    expect(body.text).toContain('215');
  });

  it('substitutes current time when caller passes an Invalid Date (defensive — F2)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendCriticalTelegramAlert({
      metricKey: 'cpu',
      value: 95,
      timestamp: new Date(NaN),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Should NOT contain the literal "Invalid Date" string from a broken
    // toISOString() rendering — that's the symptom we're defending against.
    expect(body.text).not.toContain('Invalid Date');
    // Should flag the substitution so a malformed caller is visible in the alert.
    expect(body.text).toContain('caller-supplied timestamp invalid');
    // Should still contain a valid ISO timestamp (substituted from now)
    expect(body.text).toMatch(/Time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

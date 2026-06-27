import { describe, it, expect, vi } from 'vitest';
// The Cloudflare Pages Function is a standalone deploy artifact (outside the api tsc rootDir), but
// Node has global Request/Response and api tests are tsc-excluded — so we CAN exercise it here to
// (a) cover the otherwise-untested edge code and (b) GUARD it against drifting from the canonical
// tested lib `fallback-lead.ts` (Story 13-3 code-review M1).
import { onRequestPost } from '../../../../../cloudflare-fallback/functions/api/callback.js';
import { normalizeFallbackLead } from '../fallback-lead.js';

function ctx(body: unknown, kvPut = vi.fn(async () => {})) {
  return {
    request: new Request('http://edge/api/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { LEADS_KV: { put: kvPut } },
  };
}

describe('cloudflare-fallback edge function — email-first (Story 13-3 AC2.3, code-review M1)', () => {
  it('accepts a valid callback (name+email+LGA) → 200 + writes the lead to KV', async () => {
    const kvPut = vi.fn(async () => {});
    const res = await onRequestPost(ctx({ fullName: 'Bunmi Adeleke', email: 'Bunmi@Example.com', lgaCode: 'Egbeda' }, kvPut));
    expect(res.status).toBe(200);
    expect(kvPut).toHaveBeenCalledOnce();
    const [key, value] = kvPut.mock.calls[0];
    const stored = JSON.parse(value as string);
    expect(stored).toMatchObject({ fullName: 'Bunmi Adeleke', email: 'bunmi@example.com', phone: null, lgaCode: 'Egbeda', channel: 'static_fallback' });
    expect(key).toContain('bunmi@example.com'); // keyed by the required email
  });

  it('keeps an optional phone (normalised) when supplied', async () => {
    const kvPut = vi.fn(async () => {});
    await onRequestPost(ctx({ fullName: 'Kayode O', email: 'k@x.com', phone: '08031234567', lgaCode: 'Ido' }, kvPut));
    expect(JSON.parse(kvPut.mock.calls[0][1] as string).phone).toBe('+2348031234567');
  });

  it('rejects a missing/invalid email → 400 + field errors, no KV write', async () => {
    const kvPut = vi.fn(async () => {});
    const res = await onRequestPost(ctx({ fullName: 'Test User', email: 'nope', lgaCode: 'Ido' }, kvPut));
    expect(res.status).toBe(400);
    expect(kvPut).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/email/)]));
  });

  it('returns 503 (not an unhandled 500) when the KV write fails — degradation-path robustness (L1)', async () => {
    const res = await onRequestPost(ctx({ fullName: 'Test User', email: 'k@x.com', lgaCode: 'Ido' }, vi.fn(async () => { throw new Error('kv down'); })));
    expect(res.status).toBe(503);
  });

  it('PARITY GUARD — edge validation matches the canonical fallback-lead.ts for every phone form', async () => {
    for (const phone of [undefined, '08031234567', '8031234567', '+2348031234567', '0803 123 4567']) {
      const kvPut = vi.fn(async () => {});
      const payload = { fullName: 'Test User', email: 'k@x.com', lgaCode: 'Egbeda', ...(phone ? { phone } : {}) };
      const res = await onRequestPost(ctx(payload, kvPut));
      expect(res.status).toBe(200);
      const stored = JSON.parse(kvPut.mock.calls[0][1] as string);
      const canonical = normalizeFallbackLead(payload, stored.capturedAt);
      expect(canonical.ok && canonical.lead.phone).toBe(stored.phone);
      expect(canonical.ok && canonical.lead.email).toBe(stored.email);
    }
  });
});

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Story 13-13 (AC7) — the unsubscribe endpoint is per-IP rate-limited to blunt token-grinding.
 * code-review AI-8: this behaviour was previously unmonitored. We set a tiny cap via env BEFORE the
 * dynamic import (the limiter reads UNSUBSCRIBE_RATE_MAX at module load) so the 429 is asserted
 * deterministically without firing 120+ requests. In `NODE_ENV=test` the limiter uses an in-memory
 * store (no Redis), so this is hermetic.
 */
describe('unsubscribeRateLimit (Story 13-13 AC7)', () => {
  it('returns 429 RATE_LIMIT_EXCEEDED once the per-IP cap is exceeded', async () => {
    process.env.UNSUBSCRIBE_RATE_MAX = '3';
    const { unsubscribeRateLimit } = await import('../rate-limit.js');

    const app = express();
    app.get('/x', unsubscribeRateLimit, (_req, res) => res.json({ ok: true }));
    const agent = request(app);

    await agent.get('/x').expect(200);
    await agent.get('/x').expect(200);
    await agent.get('/x').expect(200);

    const res = await agent.get('/x');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });
});

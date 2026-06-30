import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Story 13-13 — code-review AI-9: the suppress-failure (500) branch was untested. We mock the
 * suppression write to reject so no DB is needed, and assert BOTH response shapes (one-click JSON
 * and web-form HTML) plus the "writes nothing on failure" contract.
 */
vi.mock('../../services/email-events.service.js', () => ({
  suppressUnsubscribe: vi.fn(),
}));

import unsubscribeRoutes from '../unsubscribe.routes.js';
import { signUnsubscribeToken } from '../../services/unsubscribe-token.js';
import { suppressUnsubscribe } from '../../services/email-events.service.js';

const SECRET = 'test-unsub-error-13-13';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/v1/unsubscribe', unsubscribeRoutes);
  return app;
}

describe('unsubscribe suppress-failure path (Story 13-13 AC5 / code-review AI-9)', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    // mockReset:true (vitest.base.ts) wipes the factory's rejection before each test —
    // re-establish it here so the suppression write actually throws.
    vi.mocked(suppressUnsubscribe).mockRejectedValue(new Error('db down'));
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it('one-click POST → 500 JSON {code:UNSUBSCRIBE_FAILED} when the suppression write throws', async () => {
    const token = signUnsubscribeToken('x@y.ng');
    const res = await request(buildApp())
      .post('/api/v1/unsubscribe')
      .query({ token })
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'UNSUBSCRIBE_FAILED' });
  });

  it('web-form POST → 500 HTML error page when the suppression write throws', async () => {
    const token = signUnsubscribeToken('x@y.ng');
    const res = await request(buildApp())
      .post('/api/v1/unsubscribe')
      .query({ token })
      .type('form')
      .send('source=web');
    expect(res.status).toBe(500);
    expect(res.text).toContain('Something went wrong');
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { emailSuppressions } from '../../db/schema/index.js';
import { getSuppressedEmails } from '../../services/email-events.service.js';
import unsubscribeRoutes from '../unsubscribe.routes.js';
import { signUnsubscribeToken } from '../../services/unsubscribe-token.js';

const SECRET = 'test-unsubscribe-secret-routes-13-13';

// PARALLEL-SAFE ISOLATION: this file owns the `@unsub.test` keyspace (scoped cleanup/reads) so it
// never clobbers — nor is clobbered by — the other email_suppressions DB tests running concurrently.
const DOMAIN = '@unsub.test';
const SCOPE = `%${DOMAIN}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/v1/unsubscribe', unsubscribeRoutes);
  return app;
}

async function rows() {
  return db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
}

describe('GET/POST /api/v1/unsubscribe (Story 13-13 AC5/AC6/AC7)', () => {
  let prevSecret: string | undefined;
  async function cleanup() {
    await db.delete(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
  }
  beforeAll(() => {
    prevSecret = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  });
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    if (prevSecret === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prevSecret;
  });

  // ── AI-1: GET never mutates — it renders a confirmation page whose button POSTs ──────────────
  it('GET with a valid token renders a confirmation page and writes NOTHING (no GET-prefetch suppression)', async () => {
    const email = `prefetch${DOMAIN}`;
    const token = signUnsubscribeToken(email);
    const res = await request(buildApp()).get('/api/v1/unsubscribe').query({ token });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Confirm unsubscribe'); // the POST-form button, not a done message
    expect(await rows()).toHaveLength(0); // ← critical: a bare GET must not suppress
    expect((await getSuppressedEmails([email])).has(email)).toBe(false);
  });

  it('GET passes the same token through to the confirmation form action', async () => {
    const email = `formaction${DOMAIN}`;
    const token = signUnsubscribeToken(email);
    const res = await request(buildApp()).get('/api/v1/unsubscribe').query({ token });
    expect(res.text).toContain(`action="/api/v1/unsubscribe?token=${encodeURIComponent(token)}"`);
  });

  // ── POST is the only mutating verb ───────────────────────────────────────────────────────────
  it('POST one-click with a valid token suppresses (reason=unsubscribed) + returns 200 JSON', async () => {
    const email = `oneclick${DOMAIN}`;
    const token = signUnsubscribeToken(email);
    const res = await request(buildApp())
      .post('/api/v1/unsubscribe')
      .query({ token })
      .type('form')
      .send('List-Unsubscribe=One-Click');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ email, reason: 'unsubscribed' });
    // AC2 — honored by construction: getSuppressedEmails picks it up like a bounce.
    expect((await getSuppressedEmails([email])).has(email)).toBe(true);
  });

  it('POST from the web confirmation form (source=web) suppresses + renders the HTML done page', async () => {
    const email = `webform${DOMAIN}`;
    const token = signUnsubscribeToken(email);
    const res = await request(buildApp())
      .post('/api/v1/unsubscribe')
      .query({ token })
      .type('form')
      .send('source=web');

    expect(res.status).toBe(200);
    expect(res.text).toContain('unsubscribed');
    expect((await getSuppressedEmails([email])).has(email)).toBe(true);
  });

  // ── Invalid-token contract (AI-10) ───────────────────────────────────────────────────────────
  it('a forged GET → 400 with the invalid-link HTML and writes NOTHING', async () => {
    const res = await request(buildApp()).get('/api/v1/unsubscribe').query({ token: 'forged-token' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid unsubscribe link');
    expect(await rows()).toHaveLength(0);
  });

  it('a forged one-click POST → 400 JSON {code:INVALID_TOKEN} and writes NOTHING', async () => {
    const res = await request(buildApp())
      .post('/api/v1/unsubscribe')
      .query({ token: 'forged-token' })
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect(await rows()).toHaveLength(0);
  });

  it('a missing token → 400, nothing written', async () => {
    const res = await request(buildApp()).post('/api/v1/unsubscribe');
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  // ── getToken duplicate-param branch (AI-10) ──────────────────────────────────────────────────
  it('a duplicate ?token=a&token=b GET uses the first param (array branch)', async () => {
    const email = `dupparam${DOMAIN}`;
    const valid = signUnsubscribeToken(email);
    const res = await request(buildApp())
      .get('/api/v1/unsubscribe')
      .query({ token: [valid, 'junk'] });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Confirm unsubscribe'); // first (valid) token accepted
  });

  // ── Idempotency & no-downgrade ───────────────────────────────────────────────────────────────
  it('is idempotent — repeating the same one-click POST stays 200 with a single row', async () => {
    const email = `dup${DOMAIN}`;
    const token = signUnsubscribeToken(email);
    await request(buildApp()).post('/api/v1/unsubscribe').query({ token }).expect(200);
    await request(buildApp()).post('/api/v1/unsubscribe').query({ token }).expect(200);
    expect(await rows()).toHaveLength(1);
  });

  it('does NOT downgrade an existing bounce suppression (onConflictDoNothing keeps reason=bounced)', async () => {
    const email = `bounced${DOMAIN}`;
    await db.insert(emailSuppressions).values({ email, reason: 'bounced' });
    const token = signUnsubscribeToken(email);
    await request(buildApp()).post('/api/v1/unsubscribe').query({ token }).expect(200);

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe('bounced'); // unchanged — unsubscribe never clobbers a stronger signal
  });
});

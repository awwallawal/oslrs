import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Webhook } from 'svix';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { emailEvents, emailSuppressions } from '../../db/schema/index.js';
import webhookRoutes from '../webhook.routes.js';

// A valid Svix secret format (whsec_<base64>). Set BEFORE the controller reads it.
const SECRET = 'whsec_' + Buffer.from('oslsr-test-webhook-secret-key-32!').toString('base64');

// Replicates app.ts: express.raw (NOT json) for the webhook path so the Svix signature sees the
// raw body — the exact plumbing under test.
function buildApp() {
  const app = express();
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRoutes);
  return app;
}

function signed(payload: unknown) {
  const body = JSON.stringify(payload);
  const id = 'msg_test_1';
  const ts = new Date();
  const signature = new Webhook(SECRET).sign(id, ts, body);
  return {
    body,
    headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': signature },
  };
}

const deliveredPayload = {
  type: 'email.delivered',
  created_at: '2026-06-27T11:59:00.000Z',
  data: { email_id: 'rs-1', to: ['Hook@Example.com'], tags: [{ name: 'campaign_id', value: 'reengagement-2026-07' }] },
};

describe('POST /api/v1/webhooks/resend (Story 13-9 AC3)', () => {
  let prevSecret: string | undefined;
  beforeAll(() => {
    prevSecret = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM ${emailEvents}`);
    await db.execute(sql`DELETE FROM ${emailSuppressions}`);
  });
  afterAll(async () => {
    await db.execute(sql`DELETE FROM ${emailEvents}`);
    await db.execute(sql`DELETE FROM ${emailSuppressions}`);
    // code-review L1 — don't leak the test secret into the rest of the process.
    if (prevSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = prevSecret;
  });

  it('valid Svix signature → 200 + event stored (real signature round-trip)', async () => {
    const { body, headers } = signed(deliveredPayload);
    const res = await request(buildApp())
      .post('/api/v1/webhooks/resend')
      .set('content-type', 'application/json')
      .set(headers)
      .send(body);
    expect(res.status).toBe(200);
    const rows = await db.select().from(emailEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventType: 'delivered', recipient: 'hook@example.com', campaignId: 'reengagement-2026-07' });
  });

  it('is IDEMPOTENT — the same svix-id delivered twice stores only ONE row (code-review M1)', async () => {
    const { body, headers } = signed(deliveredPayload); // fixed svix-id → a retry reuses it
    const app = buildApp();
    const post = () => request(app).post('/api/v1/webhooks/resend').set('content-type', 'application/json').set(headers).send(body);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200); // retry
    expect(await db.select().from(emailEvents)).toHaveLength(1);
  });

  it('BAD signature → 401 and NOTHING written', async () => {
    const { body } = signed(deliveredPayload);
    const res = await request(buildApp())
      .post('/api/v1/webhooks/resend')
      .set('content-type', 'application/json')
      .set({ 'svix-id': 'msg_x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,deadbeef' })
      .send(body);
    expect(res.status).toBe(401);
    expect(await db.select().from(emailEvents)).toHaveLength(0);
  });

  it('a signed BOUNCE → 200 + event stored + address suppressed (AC2)', async () => {
    const { body, headers } = signed({ ...deliveredPayload, type: 'email.bounced', data: { ...deliveredPayload.data, email_id: 'rs-b', to: ['Bounce@Example.com'] } });
    const res = await request(buildApp()).post('/api/v1/webhooks/resend').set('content-type', 'application/json').set(headers).send(body);
    expect(res.status).toBe(200);
    const sup = await db.select().from(emailSuppressions);
    expect(sup).toHaveLength(1);
    expect(sup[0]).toMatchObject({ email: 'bounce@example.com', reason: 'bounced' });
  });

  it('a signed email.opened → 200 but NOT stored (AC4 — opens out)', async () => {
    const { body, headers } = signed({ ...deliveredPayload, type: 'email.opened' });
    const res = await request(buildApp()).post('/api/v1/webhooks/resend').set('content-type', 'application/json').set(headers).send(body);
    expect(res.status).toBe(200);
    expect(await db.select().from(emailEvents)).toHaveLength(0);
  });
});

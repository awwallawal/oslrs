import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Webhook } from 'svix';
import { like } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { emailEvents } from '../db/schema/index.js';

/**
 * Story 13-9 — REGRESSION for the prod bug where `app.use('/api/v1', cspRoutes)` (which installs its
 * own express.json for ALL /api/v1/* paths) consumed the webhook body BEFORE express.raw, so the Svix
 * signature verified over an empty body → every real Resend event got `bad_signature`. The minimal
 * buildApp() unit test missed it; this exercises the FULL app middleware stack. The webhook mount MUST
 * stay ordered before cspRoutes.
 */
const SECRET = 'whsec_' + Buffer.from('oslsr-integ-webhook-secret-32!!!!').toString('base64');
const SCOPE = '%@appinteg.test';

describe('Resend webhook through the FULL app stack (Story 13-9 ordering regression)', () => {
  let prev: string | undefined;
  beforeAll(() => {
    prev = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });
  afterAll(async () => {
    await db.delete(emailEvents).where(like(emailEvents.recipient, SCOPE));
    if (prev === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = prev;
  });

  it('captures the RAW body for signature verification despite cspRoutes installing express.json at /api/v1', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: { email_id: 'integ-1', to: ['Hi@appinteg.test'], tags: [{ name: 'campaign_id', value: 'integ' }] },
    });
    const id = 'msg_integ_1';
    const ts = new Date();
    const sig = new Webhook(SECRET).sign(id, ts, body);

    const res = await request(app)
      .post('/api/v1/webhooks/resend')
      .set('content-type', 'application/json')
      .set({ 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': sig })
      .send(body);

    expect(res.status).toBe(200); // 401 here = the body was consumed before express.raw (the bug)
    const rows = await db.select().from(emailEvents).where(like(emailEvents.recipient, SCOPE));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventType: 'delivered', recipient: 'hi@appinteg.test', campaignId: 'integ' });
  });
});

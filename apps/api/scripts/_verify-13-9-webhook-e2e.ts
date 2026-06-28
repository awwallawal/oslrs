/**
 * Story 13-9 — END-TO-END verification for the Resend webhook → email_events → funnel pipeline.
 *
 * Signs SYNTHETIC Resend events with the REAL `RESEND_WEBHOOK_SECRET`, POSTs them to the REAL
 * webhook endpoint, then asserts the REAL `email_events` rows, the suppression list, idempotency,
 * signature rejection, and the per-campaign funnel (`getCampaignFunnel`). No real emails are sent —
 * this proves everything EXCEPT Resend's own delivery (that's the operator's one-time real-email
 * test). Repeatable; safe (unique scoped test campaign + @oslsr.e2e recipients, cleaned up at the end).
 *
 * Run (on the box, post-deploy, with RESEND_WEBHOOK_SECRET set — same secret the app uses):
 *   cd /root/oslrs && pnpm --filter @oslsr/api exec tsx scripts/_verify-13-9-webhook-e2e.ts
 *   ... --target https://oyoskills.com    # exercise the full edge path (default: localhost:3000)
 *
 * Exit 0 = pipeline verified; 1 = a check failed (details printed).
 */
import { Webhook } from 'svix';
import { sql, like } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { emailEvents, emailSuppressions } from '../src/db/schema/index.js';
import { ReportService } from '../src/services/report.service.js';
import { getSuppressedEmails } from '../src/services/email-events.service.js';

const argv = process.argv.slice(2);
const ti = argv.indexOf('--target');
const TARGET = ti >= 0 && argv[ti + 1] ? argv[ti + 1] : 'http://localhost:3000';
const URL = `${TARGET.replace(/\/$/, '')}/api/v1/webhooks/resend`;
const SECRET = process.env.RESEND_WEBHOOK_SECRET;

const STAMP = process.env.E2E_STAMP || String(process.hrtime.bigint()); // unique per run
const CAMPAIGN = `e2e-13-9-${STAMP}`;
const RCPT = `ok-${STAMP}@oslsr.e2e`;
const BOUNCE_RCPT = `bounce-${STAMP}@oslsr.e2e`;

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

function makeEvent(type: string, to: string) {
  return JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: `e2e-${type}-${STAMP}`, to: [to], tags: [{ name: 'campaign_id', value: CAMPAIGN }] },
  });
}

async function post(body: string, headers: Record<string, string>): Promise<number> {
  const res = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  return res.status;
}

function signedHeaders(wh: Webhook, body: string, idSuffix: string): Record<string, string> {
  const id = `msg_${STAMP}_${idSuffix}`;
  const ts = new Date();
  return { 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': wh.sign(id, ts, body) };
}

async function cleanup() {
  await db.delete(emailEvents).where(like(emailEvents.recipient, '%@oslsr.e2e'));
  await db.delete(emailSuppressions).where(like(emailSuppressions.email, '%@oslsr.e2e'));
}

async function main() {
  console.log(`=== Story 13-9 webhook E2E → ${URL} (campaign ${CAMPAIGN}) ===`);
  if (!SECRET) {
    console.error('FATAL: RESEND_WEBHOOK_SECRET not set — run on the box where the app secret is set.');
    process.exit(1);
  }
  const wh = new Webhook(SECRET);
  await cleanup();

  // 1) signed sent/delivered/clicked → 200
  for (const t of ['email.sent', 'email.delivered', 'email.clicked']) {
    const body = makeEvent(t, RCPT);
    check(`${t} accepted`, (await post(body, signedHeaders(wh, body, t))) === 200);
  }
  // 2) idempotency — same svix-id delivered twice → still ONE delivered row
  {
    const body = makeEvent('email.delivered', RCPT);
    const hdrs = signedHeaders(wh, body, 'dup');
    await post(body, hdrs);
    await post(body, hdrs); // retry, same svix-id
  }
  // 3) signed bounce → 200 + suppression
  {
    const body = makeEvent('email.bounced', BOUNCE_RCPT);
    check('bounce accepted', (await post(body, signedHeaders(wh, body, 'bounce'))) === 200);
  }
  // 4) BAD signature → 401
  {
    const body = makeEvent('email.delivered', RCPT);
    check('bad signature rejected (401)', (await post(body, { 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,nope' })) === 401);
  }
  // 5) opened → 200 but NOT stored (AC4)
  {
    const body = makeEvent('email.opened', RCPT);
    check('opened accepted (200) but not stored', (await post(body, signedHeaders(wh, body, 'open'))) === 200);
  }

  // brief settle for the writes
  await new Promise((r) => setTimeout(r, 500));

  // ---- assertions on the real data ----
  const funnel = await ReportService.getCampaignFunnel(CAMPAIGN);
  check('funnel.sent = 1', funnel.sent === 1, `got ${funnel.sent}`);
  check('funnel.delivered = 1 (idempotent — retry did NOT double it)', funnel.delivered === 1, `got ${funnel.delivered}`);
  check('funnel.clicked = 1', funnel.clicked === 1, `got ${funnel.clicked}`);
  check('funnel.converted = 0 (no real registration in this test)', funnel.converted === 0, `got ${funnel.converted}`);

  const opened = await db.select().from(emailEvents).where(sql`${emailEvents.recipient} = ${RCPT} AND ${emailEvents.eventType} = 'opened'`);
  check('no `opened` rows stored (AC4)', opened.length === 0);

  const suppressed = await getSuppressedEmails([BOUNCE_RCPT, RCPT]);
  check('bounced address suppressed', suppressed.has(BOUNCE_RCPT));
  check('delivered address NOT suppressed', !suppressed.has(RCPT));

  await cleanup();
  console.log(funnel.sent ? `\nfunnel: sent=${funnel.sent} delivered=${funnel.delivered} clicked=${funnel.clicked} converted=${funnel.converted}` : '');
  console.log(failures === 0 ? '\n✅ E2E PASS — webhook → email_events → suppression → funnel all verified.' : `\n❌ ${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E error:', e instanceof Error ? e.message : e);
  void cleanup().finally(() => process.exit(1));
});

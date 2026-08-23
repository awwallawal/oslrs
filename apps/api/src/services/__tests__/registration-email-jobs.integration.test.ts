import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { like, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { respondents, campaignSends } from '../../db/schema/index.js';
import {
  handleRegistrationConfirmationJob,
  handleRegistrationThankYouJob,
} from '../registration-email-jobs.js';
import { EmailService } from '../email.service.js';
import {
  NotificationMeter,
  METER_KEYS,
  MARKETING_DAILY_CAP,
} from '../notification-meter.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';

/**
 * Story 13-65 (AC2/AC3) — THE RETRY-SAFETY PROOF, over the REAL marker in the REAL database.
 *
 * 🔴 AC2 asks for "a test that would FAIL if the marker check were deleted": run the worker handler
 * TWICE for the same `respondentId`, with the marker stamped by the FIRST run, and assert the
 * provider was called EXACTLY ONCE. Asserting "one email arrived" over a path that never re-entered
 * the guard is [[pattern-test-that-passes-over-a-hole]] — so the second call here is a genuine
 * second entry into the handler, exactly as a BullMQ retry at 2min then 10min (13-65 D5: attemptsMade>=1, so the 30s entry is unreachable) would be.
 *
 * ⛔ `buildDedupKey` cannot provide this and is not used for it: produce-side, non-atomic, 300s TTL,
 * skipped for `critical`. The third retry lands at 10 minutes.
 *
 * PARALLEL-SAFE ISOLATION: this file owns the `@retry.test` recipient keyspace and the
 * `13-65-RETRY-` reference-code prefix.
 */
const DOMAIN = '@retry.test';
const REF_PREFIX = '13-65-RETRY-';

const NOT_FINAL = { isFinalAttempt: false };

async function cleanup(): Promise<void> {
  await db.delete(campaignSends).where(like(campaignSends.email, `%${DOMAIN}`));
  await db.delete(respondents).where(like(respondents.referenceCode, `${REF_PREFIX}%`));
}

async function seedPublicRespondent(ref: string): Promise<string> {
  const id = uuidv7();
  await db.insert(respondents).values({
    id,
    referenceCode: `${REF_PREFIX}${ref}`,
    firstName: 'Retry',
    lastName: ref,
    phoneNumber: '+2348000000077',
    status: 'active',
    source: 'public',
  });
  return id;
}

const sent = () => getMockEmailProvider().getSentEmails();

describe('13-65 AC2 — a retried job must not double-send (real DB, real marker)', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(async () => {
    await cleanup();
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    resetMockEmailProvider();
    EmailService.initialize();
  });

  it('THE THANK-YOU: two handler runs for one respondent → provider called EXACTLY ONCE', async () => {
    /**
     * 🔴 THE LEDGER ROW IS DELETED BETWEEN THE TWO RUNS, DELIBERATELY, AND THAT IS THE WHOLE POINT.
     *
     * Written the obvious way — run, then re-run — this test PASSES EVEN WITH THE MARKER CHECK
     * DELETED, because 13-46's per-address gap reads the `campaign_sends` row that run 1 wrote and
     * suppresses run 2. Verified by deleting the check and watching the suite stay green. That is
     * exactly [[pattern-test-that-passes-over-a-hole]]: the safe OUTCOME is asserted while the guard
     * under test is never exercised, and AC2 names it by name.
     *
     * Removing the ledger row isolates the marker AND models a real state: `recordCampaignSend` is
     * FAIL-SOFT (`campaign-contact.service.ts` — a ledger write can fail and only log), so
     * "dispatched, no ledger row" is a state prod can genuinely be in. In that state the marker is
     * the ONLY thing standing between a BullMQ retry and a second email.
     */
    const id = await seedPublicRespondent('ty');
    const email = `ty${DOMAIN}`;
    const data = { respondentId: id, email };

    await handleRegistrationThankYouJob(data, NOT_FINAL);
    expect(sent()).toHaveLength(1);

    await db.delete(campaignSends).where(eq(campaignSends.email, email));

    // The retry, with the gap guard neutralised. Delete `metadata.thankyou_referral_sent_at` from
    // the handler and THIS is the assertion that reddens.
    await handleRegistrationThankYouJob(data, NOT_FINAL);
    expect(sent()).toHaveLength(1);
  });

  it('CONTROL for the test above: with BOTH the ledger row and the marker gone, it DOES send again', async () => {
    // Without this, "one email" above could be true because the handler never sends twice under any
    // circumstances — i.e. because the test is inert rather than because the marker works.
    const id = await seedPublicRespondent('tyctl');
    const email = `tyctl${DOMAIN}`;

    await handleRegistrationThankYouJob({ respondentId: id, email }, NOT_FINAL);
    expect(sent()).toHaveLength(1);

    await db.delete(campaignSends).where(eq(campaignSends.email, email));
    await db
      .update(respondents)
      .set({ metadata: {} })
      .where(eq(respondents.id, id));

    await handleRegistrationThankYouJob({ respondentId: id, email }, NOT_FINAL);
    expect(sent()).toHaveLength(2);
  });

  it('THE THANK-YOU: the marker is genuinely PERSISTED by run 1 — not merely in-memory', async () => {
    const id = await seedPublicRespondent('tystamp');
    await handleRegistrationThankYouJob({ respondentId: id, email: `tystamp${DOMAIN}` }, NOT_FINAL);

    const row = await db.query.respondents.findFirst({ where: eq(respondents.id, id) });
    const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.thankyou_referral_sent_at).toEqual(expect.any(String));
  });

  it('THE CONFIRMATION: two handler runs for one respondent → provider called EXACTLY ONCE', async () => {
    const id = await seedPublicRespondent('conf');
    const data = { respondentId: id, email: `conf${DOMAIN}`, referenceCode: 'OSL-2026-999001', status: 'active' };

    await handleRegistrationConfirmationJob(data, NOT_FINAL);
    expect(sent()).toHaveLength(1);

    await handleRegistrationConfirmationJob(data, NOT_FINAL);
    expect(sent()).toHaveLength(1);
  });

  it('THE CONFIRMATION: its `confirmation_email_sent_at` marker is persisted by run 1', async () => {
    // ⚖️ The story's Dev Notes said this email has NO marker and told the dev pass to decide.
    // Verified against the tree: 9-58 review L1 already added one. The decision is KEEP IT — and
    // this is the assertion that makes the decision a fact rather than a claim.
    const id = await seedPublicRespondent('confstamp');
    await handleRegistrationConfirmationJob(
      { respondentId: id, email: `confstamp${DOMAIN}`, referenceCode: 'OSL-2026-999002', status: 'active' },
      NOT_FINAL,
    );

    const row = await db.query.respondents.findFirst({ where: eq(respondents.id, id) });
    const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.confirmation_email_sent_at).toEqual(expect.any(String));
  });
});

describe('13-65 AC3 — the 13-46 cap and ledger still bind, FROM THE WORKER', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(async () => {
    await cleanup();
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    resetMockEmailProvider();
    EmailService.initialize();
  });

  it('POSITIVE CONTROL: the worker handler reaches the provider when the cap is not exhausted', async () => {
    const id = await seedPublicRespondent('control');
    await handleRegistrationThankYouJob({ respondentId: id, email: `control${DOMAIN}` }, NOT_FINAL);
    expect(sent()).toHaveLength(1);
  });

  it('makes NO PROVIDER CALL with the marketing cap exhausted — same chain, only the cap differs', async () => {
    await redis.set(
      METER_KEYS.daily('email', 'thankyou-referral', new Date().toISOString().split('T')[0]),
      String(MARKETING_DAILY_CAP),
    );
    const id = await seedPublicRespondent('capped');
    await handleRegistrationThankYouJob({ respondentId: id, email: `capped${DOMAIN}` }, NOT_FINAL);
    expect(sent()).toHaveLength(0);
  });

  it('does NOT stamp the send-once marker when the cap refused the send', async () => {
    await redis.set(
      METER_KEYS.daily('email', 'thankyou-referral', new Date().toISOString().split('T')[0]),
      String(MARKETING_DAILY_CAP),
    );
    const id = await seedPublicRespondent('nomarker');
    await handleRegistrationThankYouJob({ respondentId: id, email: `nomarker${DOMAIN}` }, NOT_FINAL);

    const row = await db.query.respondents.findFirst({ where: eq(respondents.id, id) });
    const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.thankyou_referral_sent_at).toBeUndefined();
  });

  it('WRITES the `campaign_sends` ledger row from the worker, so the next registration is throttled', async () => {
    const email = `ledger${DOMAIN}`;
    const id = await seedPublicRespondent('ledger');
    await handleRegistrationThankYouJob({ respondentId: id, email }, NOT_FINAL);

    const rows = await db.select().from(campaignSends).where(eq(campaignSends.email, email));
    expect(rows).toHaveLength(1);

    // The mail-cannon shot: a DIFFERENT respondent row, the same address, minutes later.
    const second = await seedPublicRespondent('ledger-2');
    await handleRegistrationThankYouJob({ respondentId: second, email }, NOT_FINAL);
    expect(sent()).toHaveLength(1); // STILL one
  });

  it('the CONFIRMATION writes NO ledger row — it is transactional, not marketing', async () => {
    const email = `noledger${DOMAIN}`;
    const id = await seedPublicRespondent('noledger');
    await handleRegistrationConfirmationJob(
      { respondentId: id, email, referenceCode: 'OSL-2026-999003', status: 'active' },
      NOT_FINAL,
    );

    expect(sent()).toHaveLength(1);
    const rows = await db.select().from(campaignSends).where(eq(campaignSends.email, email));
    expect(rows).toHaveLength(0);
  });

  it('the CONFIRMATION is NOT refused by an exhausted MARKETING cap', async () => {
    // A citizen's own reference code behind a marketing throttle is the failure AC3 forbids.
    await redis.set(
      METER_KEYS.daily('email', 'thankyou-referral', new Date().toISOString().split('T')[0]),
      String(MARKETING_DAILY_CAP),
    );
    const id = await seedPublicRespondent('confcap');
    await handleRegistrationConfirmationJob(
      { respondentId: id, email: `confcap${DOMAIN}`, referenceCode: 'OSL-2026-999004', status: 'active' },
      NOT_FINAL,
    );
    expect(sent()).toHaveLength(1);
  });
});

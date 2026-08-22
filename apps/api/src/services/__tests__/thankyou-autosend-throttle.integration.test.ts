import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { like, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { respondents, campaignSends } from '../../db/schema/index.js';
import { SubmissionProcessingService } from '../submission-processing.service.js';
import { EmailService } from '../email.service.js';
import {
  NotificationMeter,
  METER_KEYS,
  MARKETING_DAILY_CAP,
} from '../notification-meter.service.js';
import { MARKETING_CONTACT_GAP_DAYS } from '../campaign-contact.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';

/**
 * Story 13-46 (AC2 / AC8) — the per-ADDRESS throttle on the registration auto thank-you, and the
 * one test that proves the AC1 cap is reached from the path that actually sends.
 *
 * THE MAIL-CANNON SHAPE this closes: the existing send-once marker is stamped on the RESPONDENT
 * (`metadata.thankyou_referral_sent_at`), and the wizard has NO email dedupe on the respondent side
 * (there is no `email` column on `respondents` at all). So a NEW respondent row for the SAME
 * address walks straight past the marker — one address, N registrations, N emails.
 *
 * PARALLEL-SAFE ISOLATION: this file owns the `@cannon.test` recipient keyspace and the
 * `13-46-TY-` reference-code prefix.
 */
const DOMAIN = '@cannon.test';
const REF_PREFIX = '13-46-TY-';

const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanup(): Promise<void> {
  await db.delete(campaignSends).where(like(campaignSends.email, `%${DOMAIN}`));
  await db.delete(respondents).where(like(respondents.referenceCode, `${REF_PREFIX}%`));
}

/** A PUBLIC respondent — the thank-you self-gates on `source='public'`. */
async function seedPublicRespondent(ref: string): Promise<string> {
  const id = uuidv7();
  await db.insert(respondents).values({
    id,
    referenceCode: `${REF_PREFIX}${ref}`,
    firstName: 'Test',
    lastName: ref,
    phoneNumber: '+2348000000000',
    status: 'active',
    source: 'public',
  });
  return id;
}

/** Record a prior marketing contact to this address, `daysAgo` in the past. */
async function seedPriorContact(email: string, daysAgo: number): Promise<void> {
  await db.insert(campaignSends).values({
    email: email.toLowerCase(),
    campaignId: 'thankyou-referral-auto',
    category: 'thankyou-referral',
    channel: 'email',
    sentAt: new Date(Date.now() - daysAgo * DAY_MS),
  });
}

const sent = () => getMockEmailProvider().getSentEmails();

describe('registration auto thank-you — per-address throttle + cap (13-46 AC2/AC8) — real DB', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(async () => {
    await cleanup();
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    resetMockEmailProvider();
    // The provider singleton is rebuilt per test; re-init so dispatch resolves the fresh mock.
    EmailService.initialize();
  });

  describe('AC2 — one thank-you per ADDRESS per gap, not per respondent row', () => {
    it('SENDS to an address never contacted before (the allowed direction)', async () => {
      const id = await seedPublicRespondent('fresh');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email: `fresh${DOMAIN}`,
        isNew: false,
      });

      expect(sent()).toHaveLength(1);
      expect(sent()[0].to).toBe(`fresh${DOMAIN}`);
    });

    it('DOES NOT SEND to an address contacted inside the gap — even for a BRAND NEW respondent row', async () => {
      // THE mail-cannon test. Two separate respondents, one address: the per-respondent marker
      // cannot see the first send, so only an address-keyed guard stops the second.
      const email = `repeat${DOMAIN}`;
      await seedPriorContact(email, 1);
      const second = await seedPublicRespondent('repeat-2');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: second,
        email,
        isNew: false,
      });

      expect(sent()).toHaveLength(0);
    });

    it('SENDS again once the address is OUTSIDE the gap (a cap that blocks forever is broken)', async () => {
      const email = `lapsed${DOMAIN}`;
      await seedPriorContact(email, MARKETING_CONTACT_GAP_DAYS + 1);
      const id = await seedPublicRespondent('lapsed');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email,
        isNew: false,
      });

      expect(sent()).toHaveLength(1);
    });

    it('throttles on the CANONICAL address — mixed case is the same inbox', async () => {
      await seedPriorContact(`mixed${DOMAIN}`, 1);
      const id = await seedPublicRespondent('mixed');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email: `MiXeD${DOMAIN.toUpperCase()}`,
        isNew: false,
      });

      expect(sent()).toHaveLength(0);
    });

    it('does NOT throttle a DIFFERENT address (the guard is per-address, not global)', async () => {
      await seedPriorContact(`other${DOMAIN}`, 1);
      const id = await seedPublicRespondent('distinct');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email: `distinct${DOMAIN}`,
        isNew: false,
      });

      expect(sent()).toHaveLength(1);
    });

    it('leaves the send-once marker path intact — a re-run for the SAME respondent still no-ops', async () => {
      const id = await seedPublicRespondent('once');
      const email = `once${DOMAIN}`;

      await SubmissionProcessingService.sendRegistrationAutoEmails({ respondentId: id, email, isNew: false });
      expect(sent()).toHaveLength(1);

      await SubmissionProcessingService.sendRegistrationAutoEmails({ respondentId: id, email, isNew: false });
      expect(sent()).toHaveLength(1); // still one — the marker held
    });

    it('writes the ledger row on a real send, so the NEXT registration is throttled by it', async () => {
      const email = `chain${DOMAIN}`;
      const first = await seedPublicRespondent('chain-1');
      await SubmissionProcessingService.sendRegistrationAutoEmails({ respondentId: first, email, isNew: false });
      expect(sent()).toHaveLength(1);

      const rows = await db.select().from(campaignSends).where(eq(campaignSends.email, email));
      expect(rows).toHaveLength(1);

      // A second registration with the same address, minutes later — the cannon shot.
      const second = await seedPublicRespondent('chain-2');
      await SubmissionProcessingService.sendRegistrationAutoEmails({ respondentId: second, email, isNew: false });
      expect(sent()).toHaveLength(1); // STILL one
    });
  });

  describe('AC8 — the cap is REACHED from the real send path', () => {
    it('POSITIVE CONTROL: the chain reaches the provider when the cap is not exhausted', async () => {
      const id = await seedPublicRespondent('control');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email: `control${DOMAIN}`,
        isNew: false,
      });

      expect(sent()).toHaveLength(1);
    });

    it('makes NO PROVIDER CALL with the marketing cap exhausted — driven through the REAL chain', async () => {
      // Same chain, same inputs as the control above; only the cap differs.
      await redis.set(
        METER_KEYS.daily('email', 'thankyou-referral', new Date().toISOString().split('T')[0]),
        String(MARKETING_DAILY_CAP),
      );
      const id = await seedPublicRespondent('capped');

      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email: `capped${DOMAIN}`,
        isNew: false,
      });

      expect(sent()).toHaveLength(0);
    });

    it('does NOT stamp the send-once marker when the cap refused the send', async () => {
      // Otherwise the refusal would be permanent: the citizen never gets a thank-you, and a re-run
      // after the cap is raised would skip them as "already sent".
      await redis.set(
        METER_KEYS.daily('email', 'thankyou-referral', new Date().toISOString().split('T')[0]),
        String(MARKETING_DAILY_CAP),
      );
      const id = await seedPublicRespondent('nomarker');
      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: id,
        email: `nomarker${DOMAIN}`,
        isNew: false,
      });

      const row = await db.query.respondents.findFirst({ where: eq(respondents.id, id) });
      const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
      expect(metadata.thankyou_referral_sent_at).toBeUndefined();
    });
  });
});

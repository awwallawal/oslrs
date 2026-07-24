import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import { like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { campaignSends, emailSuppressions } from '../../db/schema/index.js';
import {
  MARKETING_CONTACT_GAP_DAYS,
  filterMarketingCohort,
  gapCutoff,
  getRecentlyContactedEmails,
  recordCampaignSend,
  resolveGapDays,
} from '../campaign-contact.service.js';

/**
 * Story 13-24 (AC3/AC6) — the shared marketing-cohort guard.
 *
 * PARALLEL-SAFE ISOLATION: this file owns the `@cc.test` recipient keyspace (same convention as
 * `email-events.service.test.ts`); every read + cleanup is scoped to it.
 */
const DOMAIN = '@cc.test';
const SCOPE = `%${DOMAIN}`;
const NOW = new Date('2026-07-23T12:00:00.000Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

async function cleanup() {
  await db.delete(campaignSends).where(like(campaignSends.email, SCOPE));
  await db.delete(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
}

describe('campaign-contact — gap constant + resolution (AC6: gap as DATA)', () => {
  const original = process.env.MARKETING_CONTACT_GAP_DAYS;
  afterEach(() => {
    if (original === undefined) delete process.env.MARKETING_CONTACT_GAP_DAYS;
    else process.env.MARKETING_CONTACT_GAP_DAYS = original;
  });

  it('defaults to the named 5-day constant (the resolved 3-vs-5 decision)', () => {
    delete process.env.MARKETING_CONTACT_GAP_DAYS;
    expect(MARKETING_CONTACT_GAP_DAYS).toBe(5);
    expect(resolveGapDays()).toBe(5);
  });

  it('an explicit argument wins over env + default', () => {
    process.env.MARKETING_CONTACT_GAP_DAYS = '9';
    expect(resolveGapDays(2)).toBe(2);
  });

  it('honours a valid MARKETING_CONTACT_GAP_DAYS override', () => {
    process.env.MARKETING_CONTACT_GAP_DAYS = '9';
    expect(resolveGapDays()).toBe(9);
  });

  it('an invalid / zero / negative override falls back to 5 — NEVER to 0 (that would disable the guard silently)', () => {
    for (const bad of ['0', '-3', 'soon', '']) {
      process.env.MARKETING_CONTACT_GAP_DAYS = bad;
      expect(resolveGapDays()).toBe(5);
    }
  });

  it('gapCutoff is exactly gapDays before now', () => {
    expect(gapCutoff(5, NOW).toISOString()).toBe('2026-07-18T12:00:00.000Z');
  });
});

describe('campaign-contact — ledger write + read (AC3a) — DB', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it('recordCampaignSend stores the CANONICAL (trim + lowercase) address', async () => {
    await recordCampaignSend({
      email: `  Mixed.Case${DOMAIN.toUpperCase()} `,
      campaignId: 'thankyou-referral-2026-07',
      category: 'thankyou-referral',
      messageId: 'msg-1',
    });
    const rows = await db.select().from(campaignSends).where(like(campaignSends.email, SCOPE));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: `mixed.case${DOMAIN}`,
      campaignId: 'thankyou-referral-2026-07',
      category: 'thankyou-referral',
      channel: 'email',
      messageId: 'msg-1',
    });
  });

  it('is APPEND-ONLY — a second contact in a later campaign is recorded, not swallowed', async () => {
    await recordCampaignSend({ email: `dup${DOMAIN}`, campaignId: 'round-1' });
    await recordCampaignSend({ email: `dup${DOMAIN}`, campaignId: 'round-2' });
    const rows = await db.select().from(campaignSends).where(like(campaignSends.email, SCOPE));
    expect(rows).toHaveLength(2);
  });

  it('getRecentlyContactedEmails returns addresses INSIDE the window and not those outside it', async () => {
    await recordCampaignSend({ email: `recent${DOMAIN}`, sentAt: daysAgo(2) });
    await recordCampaignSend({ email: `old${DOMAIN}`, sentAt: daysAgo(30) });
    const got = await getRecentlyContactedEmails(
      [`RECENT${DOMAIN.toUpperCase()}`, `old${DOMAIN}`, `never${DOMAIN}`],
      5,
      NOW,
    );
    expect(got.has(`recent${DOMAIN}`)).toBe(true);
    expect(got.has(`old${DOMAIN}`)).toBe(false);
    expect(got.has(`never${DOMAIN}`)).toBe(false);
  });

  it('the window boundary moves with the gap: a 6-day-old contact is out at 5d, in at 7d', async () => {
    await recordCampaignSend({ email: `boundary${DOMAIN}`, sentAt: daysAgo(6) });
    expect((await getRecentlyContactedEmails([`boundary${DOMAIN}`], 5, NOW)).size).toBe(0);
    expect((await getRecentlyContactedEmails([`boundary${DOMAIN}`], 7, NOW)).size).toBe(1);
  });

  it('empty input never queries', async () => {
    expect((await getRecentlyContactedEmails([], 5, NOW)).size).toBe(0);
  });
});

describe('campaign-contact — filterMarketingCohort: the INHERITED filter (AC3b) — DB', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  const rows = (...emails: string[]) => emails.map((email, i) => ({ email, tag: `row-${i}` }));

  it('drops suppressed AND recently-contacted addresses, keeping the rest', async () => {
    await db
      .insert(emailSuppressions)
      .values({ email: `bounced${DOMAIN}`, reason: 'bounced' });
    await recordCampaignSend({ email: `welcomed${DOMAIN}`, sentAt: daysAgo(1) });

    const result = await filterMarketingCohort(
      rows(`bounced${DOMAIN}`, `welcomed${DOMAIN}`, `fresh${DOMAIN}`),
      (r) => r.email,
      { now: NOW },
    );

    expect(result.cohort.map((r) => r.email)).toEqual([`fresh${DOMAIN}`]);
    expect(result.suppressedSkipped).toBe(1);
    expect(result.recentlyContactedSkipped).toBe(1);
    expect(result.recentlyContactedEmails).toEqual([`welcomed${DOMAIN}`]);
    expect(result.gapDays).toBe(5);
  });

  it('does NOT double-count: a suppressed address is never also counted as recently contacted', async () => {
    await db.insert(emailSuppressions).values({ email: `both${DOMAIN}`, reason: 'complained' });
    await recordCampaignSend({ email: `both${DOMAIN}`, sentAt: daysAgo(1) });

    const result = await filterMarketingCohort(rows(`both${DOMAIN}`), (r) => r.email, { now: NOW });
    expect(result.cohort).toHaveLength(0);
    expect(result.suppressedSkipped).toBe(1);
    expect(result.recentlyContactedSkipped).toBe(0);
  });

  it('matches case-insensitively — a mixed-case cohort row is still deduped', async () => {
    await recordCampaignSend({ email: `casey${DOMAIN}`, sentAt: daysAgo(1) });
    const result = await filterMarketingCohort(
      rows(`CASEY${DOMAIN.toUpperCase()}`),
      (r) => r.email,
      { now: NOW },
    );
    expect(result.cohort).toHaveLength(0);
  });

  it('an address contacted OUTSIDE the window is sendable again (the gap is a window, not "ever")', async () => {
    await recordCampaignSend({ email: `lastmonth${DOMAIN}`, sentAt: daysAgo(30) });
    const result = await filterMarketingCohort(rows(`lastmonth${DOMAIN}`), (r) => r.email, {
      now: NOW,
    });
    expect(result.cohort.map((r) => r.email)).toEqual([`lastmonth${DOMAIN}`]);
  });

  it('an empty cohort short-circuits and still reports the gap', async () => {
    const result = await filterMarketingCohort([], (r: { email: string }) => r.email, { now: NOW });
    expect(result.cohort).toEqual([]);
    expect(result.gapDays).toBe(5);
  });

  it('INTRA-RUN de-dupe (M2): one canonical address appearing twice sends ONCE, keeping the first row', async () => {
    // Two rows, same address (different case) — e.g. two respondent rows for a duplicate
    // registration. The ledger dedupes across runs; this must dedupe within one run.
    const result = await filterMarketingCohort(
      rows(`twin${DOMAIN}`, `TWIN${DOMAIN.toUpperCase()}`, `solo${DOMAIN}`),
      (r) => r.email,
      { now: NOW },
    );
    expect(result.cohort.map((r) => r.email)).toEqual([`twin${DOMAIN}`, `solo${DOMAIN}`]);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.suppressedSkipped).toBe(0);
    expect(result.recentlyContactedSkipped).toBe(0);
  });

  it('a duplicate that is ALSO recently contacted is counted once, as recent — not double-dropped', async () => {
    await recordCampaignSend({ email: `dupe-recent${DOMAIN}`, sentAt: daysAgo(1) });
    const result = await filterMarketingCohort(
      rows(`dupe-recent${DOMAIN}`, `dupe-recent${DOMAIN}`),
      (r) => r.email,
      { now: NOW },
    );
    expect(result.cohort).toHaveLength(0);
    expect(result.recentlyContactedSkipped).toBe(2); // both rows dropped by the gap, before de-dupe
    expect(result.duplicatesSkipped).toBe(0);
  });
});

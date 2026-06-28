import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { emailEvents, submissions, respondents } from '../../db/schema/index.js';
import { ReportService } from '../report.service.js';

/**
 * Story 13-9 (AC5) — REAL-DB test for the per-campaign funnel. Runs the actual JSON-path
 * SQL against the test database (mocked-DB tests would hide a `raw_data -> ...` typo — the
 * project's raw-SQL-schema-drift anti-pattern). Seeds email_events + submissions, then asserts
 * the funnel legs and conversion attribution (both the utm path and the by-construction tag).
 *
 * PARALLEL-SAFE ISOLATION: this file owns a UNIQUE campaign keyspace (`funnel-test-*`) and
 * `funnel-sub-%` submissions. It NEVER wholesale-deletes the shared `email_events` table and
 * all reads are campaign-filtered, so it cannot clobber — nor be clobbered by — the other
 * email_events DB tests running concurrently (CI is uncapped; see vitest.base.ts).
 */

const CAMPAIGN = 'funnel-test-2026';
const OTHER = 'funnel-test-other';

async function event(over: Partial<typeof emailEvents.$inferInsert>) {
  await db.insert(emailEvents).values({
    messageId: `m-${Math.random().toString(36).slice(2)}`,
    recipient: 'x@example.com',
    eventType: 'delivered',
    campaignId: CAMPAIGN,
    occurredAt: new Date('2026-06-28T10:00:00Z'),
    ...over,
  });
}

let uid = 0;
async function submission(rawData: Record<string, unknown>, respondentId?: string) {
  uid += 1;
  await db.insert(submissions).values({
    submissionUid: `funnel-sub-${uid}-${Math.random().toString(36).slice(2)}`,
    questionnaireFormId: 'form-1',
    submittedAt: new Date('2026-06-28T10:00:00Z'),
    rawData,
    respondentId,
  });
}

// Respondents created by this file (tracked so cleanup deletes only ours).
const createdRespondentIds: string[] = [];
async function respondent(): Promise<string> {
  const [r] = await db.insert(respondents).values({}).returning({ id: respondents.id });
  createdRespondentIds.push(r.id);
  return r.id;
}

describe('ReportService.getCampaignFunnel (Story 13-9 AC5) — DB', () => {
  async function cleanup() {
    // Scoped to THIS file's keyspace only — never a wholesale table delete.
    await db.delete(emailEvents).where(inArray(emailEvents.campaignId, [CAMPAIGN, OTHER]));
    // Submissions (FK child) BEFORE respondents (parent), to satisfy the FK.
    await db.execute(sql`DELETE FROM ${submissions} WHERE ${submissions.submissionUid} LIKE 'funnel-sub-%'`);
    if (createdRespondentIds.length) {
      await db.delete(respondents).where(inArray(respondents.id, [...createdRespondentIds]));
      createdRespondentIds.length = 0;
    }
  }
  beforeEach(cleanup);
  afterAll(cleanup);

  it('counts distinct recipients per leg and attributes conversions (utm + by-construction)', async () => {
    // Email legs for THIS campaign.
    await event({ eventType: 'sent', recipient: 'a@x.com' });
    await event({ eventType: 'sent', recipient: 'b@x.com' });
    await event({ eventType: 'delivered', recipient: 'a@x.com' });
    await event({ eventType: 'delivered', recipient: 'b@x.com' });
    // a@x.com clicked twice (at-least-once retries) → still ONE distinct recipient.
    await event({ eventType: 'clicked', recipient: 'a@x.com', messageId: 'click-1' });
    await event({ eventType: 'clicked', recipient: 'a@x.com', messageId: 'click-2' });
    // Noise: another campaign's events must not leak in.
    await event({ eventType: 'sent', recipient: 'z@x.com', campaignId: OTHER });

    // Conversions: one via the wizard utm path, one via the by-construction flat tag.
    await submission({ campaign_source: { channel: 'email', utm: { campaign: CAMPAIGN } } });
    await submission({ campaign: CAMPAIGN });
    // Noise conversions for other campaigns must not count.
    await submission({ campaign_source: { channel: 'email', utm: { campaign: OTHER } } });
    await submission({ campaign: OTHER });

    const funnel = await ReportService.getCampaignFunnel(CAMPAIGN);

    expect(funnel).toEqual({
      campaignId: CAMPAIGN,
      sent: 2,
      delivered: 2,
      clicked: 1,
      converted: 2,
    });
  });

  it('counts a duplicate registration (same respondent, two submissions) as ONE conversion — L2', async () => {
    const rid = await respondent();
    await submission({ campaign: CAMPAIGN }, rid);
    await submission({ campaign: CAMPAIGN }, rid); // same person resubmits
    // A second, distinct registrant also converts.
    await submission({ campaign_source: { utm: { campaign: CAMPAIGN } } }, await respondent());

    const funnel = await ReportService.getCampaignFunnel(CAMPAIGN);
    expect(funnel.converted).toBe(2); // two PEOPLE, not three rows
  });

  it('returns an all-zero funnel for an unknown campaign', async () => {
    const funnel = await ReportService.getCampaignFunnel('no-such-campaign');
    expect(funnel).toEqual({
      campaignId: 'no-such-campaign',
      sent: 0,
      delivered: 0,
      clicked: 0,
      converted: 0,
    });
  });
});

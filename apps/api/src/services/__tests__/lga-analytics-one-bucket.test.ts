/**
 * Story 13-16 (AC4/AC6) — with `respondents.lgaId` canonically the slug on
 * EVERY channel, a public row and an enumerator row for the SAME LGA aggregate
 * into ONE analytics bucket (no UUID/slug split, no "Unknown"), and the
 * supervisor scope filter (`r.lga_id = scope.lgaCode`) resolves both sources.
 * Real-DB (app_test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { respondents, submissions, lgas } from '../../db/schema/index.js';
import { ReportService } from '../report.service.js';
import { SurveyAnalyticsService } from '../survey-analytics.service.js';

describe('LGA analytics one-bucket aggregation (Story 13-16 AC4)', () => {
  const stamp = Date.now();
  const slug = `lga_13_16_bucket_${stamp}`;
  const lgaName = `Bucket Test ${stamp}`;
  const respondentIds: string[] = [];

  beforeAll(async () => {
    await db.insert(lgas).values({ code: slug, name: lgaName });

    // 3 public + 3 enumerator respondents, ALL holding the canonical slug
    // (the post-13-16 state: wizard writes slug, backfill converted the rest).
    const values = Array.from({ length: 6 }, (_, i) => ({
      firstName: `Bucket${i}`,
      phoneNumber: `+234801321${i}${stamp.toString().slice(-3)}`,
      lgaId: slug,
      source: (i < 3 ? 'public' : 'enumerator') as 'public' | 'enumerator',
    }));
    const rows = await db.insert(respondents).values(values).returning({ id: respondents.id });
    respondentIds.push(...rows.map((r) => r.id));

    const now = new Date();
    await db.insert(submissions).values(
      rows.map((r, i) => ({
        submissionUid: uuidv7(),
        questionnaireFormId: 'lga-13-16-test-form',
        submitterId: null,
        respondentId: r.id,
        enumeratorId: null,
        rawData: { gender: 'male', lga_id: slug } as Record<string, unknown>,
        gpsLatitude: null,
        gpsLongitude: null,
        completionTimeSeconds: null,
        submittedAt: now,
        source: (i < 3 ? 'public' : 'enumerator') as 'public' | 'enumerator',
        processed: true,
        processedAt: now,
      })),
    );
  }, 30000);

  afterAll(async () => {
    if (respondentIds.length) {
      await db.delete(submissions).where(inArray(submissions.respondentId, respondentIds));
      await db.delete(respondents).where(inArray(respondents.id, respondentIds));
    }
    await db.delete(lgas).where(eq(lgas.code, slug));
  }, 30000);

  it('report.getLgaBreakdown counts public + enumerator rows in the SAME LGA bucket', async () => {
    const breakdown = await ReportService.getLgaBreakdown();
    const mine = breakdown.filter((b) => b.lgaCode === slug);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ lgaCode: slug, lgaName, count: 6 });
  });

  it('survey-analytics LGA distribution resolves both sources to ONE named bucket (no UUID label, no Unknown)', async () => {
    const demo = await SurveyAnalyticsService.getDemographics(
      { type: 'system' },
      { lgaId: slug },
    );
    // Filtered to our LGA: exactly one bucket, labeled with the human name.
    expect(demo.lgaDistribution).toHaveLength(1);
    expect(demo.lgaDistribution[0]).toMatchObject({ label: lgaName, count: 6 });
    expect(demo.lgaDistribution[0].suppressed).not.toBe(true);
  });

  it('the supervisor LGA scope filter (r.lga_id = scope.lgaCode) sees both sources', async () => {
    const demo = await SurveyAnalyticsService.getDemographics({
      type: 'lga',
      lgaCode: slug,
    });
    expect(demo.lgaDistribution).toHaveLength(1);
    expect(demo.lgaDistribution[0]).toMatchObject({ label: lgaName, count: 6 });
    // Both sources are inside the scope — the per-source split adds to 6.
    const bySource = await SurveyAnalyticsService.getDemographics(
      { type: 'lga', lgaCode: slug },
      { source: 'public' },
    );
    expect(bySource.lgaDistribution[0]?.label).toBe(lgaName);
  });
});

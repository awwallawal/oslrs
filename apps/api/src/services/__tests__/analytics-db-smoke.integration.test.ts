import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { lgas } from '../../db/schema/lgas.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { PersonalStatsService } from '../personal-stats.service.js';
import { TeamQualityService } from '../team-quality.service.js';
import { SurveyAnalyticsService } from '../survey-analytics.service.js';
import { PublicInsightsService } from '../public-insights.service.js';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';

/**
 * Real-DB analytics SMOKE — executes the analytics services' RAW SQL against a
 * live Postgres (CI `test-api` provides one via DATABASE_URL + db:push:full:force;
 * a local Postgres is also expected, same as the respondents.constraints test).
 *
 * WHY THIS EXISTS: the analytics services build queries with `db.execute(sql\`…\`)`,
 * which is NOT type-checked against the Drizzle schema, and the unit tests mock
 * `db.execute`. That combination let real production 500s ship green:
 *   - 2026-06-09: `u.role` referenced after roles were normalised to `role_id`
 *     → enumerator "My Stats" returned 500 on every card.
 *   - Hotfix 9.6 (2026-04-05): `submitter_id`/`enumerator_id` (TEXT) joined to
 *     `users.id` (UUID) without a `::text` cast, and `ANY(${jsArray})` which the
 *     pg driver can't serialise.
 * Postgres validates column references and operand types at PLAN time, so these
 * faults throw even when the query matches zero rows. This smoke just needs each
 * query to EXECUTE against the real schema — it asserts the services resolve,
 * not specific values. It is the regression gate for that whole class.
 *
 * Follows the project integration-test pattern (beforeAll/afterAll, never
 * beforeEach/afterEach; authoritative cleanup via captured ids).
 */

const TAG = '_analytics_smoke_';
const enumeratorId = uuidv7();
const lgaId = uuidv7();
const respondentId = uuidv7();
const submissionId = uuidv7();
let createdRoleId: string | null = null; // only set when WE inserted the role (don't delete a shared one)

describe('analytics services — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    // LGA (synthetic, unique) — FK target for users.lga_id.
    await db.insert(lgas).values({ id: lgaId, name: `${TAG}lga`, code: `${TAG}lga` });

    // The service's LGA-fallback team query filters `roles.name IN ('enumerator',…)`,
    // so the seeded user MUST carry the real 'enumerator' role for that path to
    // resolve. Reuse the row if it already exists (seeded env); otherwise create it.
    const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'enumerator')).limit(1);
    let enumeratorRoleId: string;
    if (existing.length) {
      enumeratorRoleId = existing[0].id;
    } else {
      enumeratorRoleId = uuidv7();
      await db.insert(roles).values({ id: enumeratorRoleId, name: 'enumerator', description: `${TAG}role` });
      createdRoleId = enumeratorRoleId;
    }

    // Enumerator WITH an lga_id and NO team_assignment → exercises exactly the
    // LGA-fallback `JOIN roles` path that 500'd on 2026-06-09.
    await db.insert(users).values({
      id: enumeratorId,
      email: `${TAG}${enumeratorId}@example.com`,
      fullName: 'Analytics Smoke Enumerator',
      roleId: enumeratorRoleId,
      lgaId,
      status: 'active',
    });

    await db.insert(respondents).values({
      id: respondentId,
      lgaId: `${TAG}lga`,
      status: 'active',
      source: 'enumerator',
      submitterId: enumeratorId,
    });

    // One submission with the demographic fields the diversity/skills queries read
    // (a valid ISO `dob` also exercises the `(raw_data->>'dob')::date` cast).
    await db.insert(submissions).values({
      id: submissionId,
      submissionUid: `${TAG}${submissionId}`,
      questionnaireFormId: 'smoke-form',
      submitterId: enumeratorId,
      enumeratorId: enumeratorId,
      respondentId,
      rawData: { gender: 'male', dob: '1995-04-12', skills_possessed: 'tailoring carpentry', nin: '12345678901' },
      completionTimeSeconds: 240,
      submittedAt: new Date(),
      source: 'webapp',
    });
  });

  afterAll(async () => {
    await db.delete(submissions).where(eq(submissions.id, submissionId));
    await db.delete(respondents).where(eq(respondents.id, respondentId));
    await db.delete(users).where(eq(users.id, enumeratorId));
    await db.delete(lgas).where(eq(lgas.id, lgaId));
    if (createdRoleId) await db.delete(roles).where(inArray(roles.id, [createdRoleId]));
  });

  it('PersonalStatsService.getPersonalStats runs every sub-query (incl. LGA-fallback roles join + dob cast)', async () => {
    const result = await PersonalStatsService.getPersonalStats(enumeratorId);
    // Value assertions are secondary; the point is the raw SQL EXECUTED against
    // the real schema. The seeded submission should be counted.
    expect(result).toBeTruthy();
    expect(result.cumulativeCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.dailyTrend)).toBe(true);
    expect(result.respondentDiversity).toBeTruthy();
  });

  it('PersonalStatsService.getPersonalStats works for the clerk weighting path too', async () => {
    const result = await PersonalStatsService.getPersonalStats(enumeratorId, {}, true);
    expect(result).toBeTruthy();
  });

  it('TeamQualityService.getTeamQuality runs (enumerator_id::text ↔ users.id join)', async () => {
    const result = await TeamQualityService.getTeamQuality([enumeratorId]);
    expect(result).toBeTruthy();
  });

  it('SurveyAnalyticsService.getEnumeratorReliability runs (submitter_id::text ↔ users.id join)', async () => {
    const result = await SurveyAnalyticsService.getEnumeratorReliability({ type: 'system' });
    expect(result).toBeTruthy();
  });

  // SurveyAnalyticsService — system-scoped descriptive endpoints. These hold the
  // bulk of the raw SQL (47 db.execute calls). Each must EXECUTE against the real
  // schema; values are not asserted (the DB may be empty in CI).
  const SYSTEM: AnalyticsScope = { type: 'system' };
  const surveyMethods: Array<[string, () => Promise<unknown>]> = [
    ['getDemographics', () => SurveyAnalyticsService.getDemographics(SYSTEM)],
    ['getEmployment', () => SurveyAnalyticsService.getEmployment(SYSTEM)],
    ['getHousehold', () => SurveyAnalyticsService.getHousehold(SYSTEM)],
    ['getSkillsFrequency', () => SurveyAnalyticsService.getSkillsFrequency(SYSTEM)],
    ['getTrends', () => SurveyAnalyticsService.getTrends(SYSTEM)],
    ['getRegistrySummary', () => SurveyAnalyticsService.getRegistrySummary(SYSTEM)],
    ['getPipelineSummary', () => SurveyAnalyticsService.getPipelineSummary(SYSTEM)],
    ['getSkillsInventory', () => SurveyAnalyticsService.getSkillsInventory(SYSTEM)],
    ['getInferentialInsights', () => SurveyAnalyticsService.getInferentialInsights(SYSTEM)],
    ['getExtendedEquity', () => SurveyAnalyticsService.getExtendedEquity(SYSTEM)],
    ['getActivationStatus', () => SurveyAnalyticsService.getActivationStatus(SYSTEM)],
  ];

  it.each(surveyMethods)('SurveyAnalyticsService.%s runs against the real schema', async (_name, run) => {
    await expect(run()).resolves.toBeTruthy();
  });

  it('PublicInsightsService.getPublicInsights + getTrends run (public, raw-SQL-heavy)', async () => {
    await expect(PublicInsightsService.getPublicInsights()).resolves.toBeTruthy();
    await expect(PublicInsightsService.getTrends()).resolves.toBeTruthy();
  });

  it('sanity: the documented schema invariants still hold (text submitter/enumerator, uuid users.id)', async () => {
    const rows = await db.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name='submissions' AND column_name IN ('submitter_id','enumerator_id')
    `);
    const types = Object.fromEntries((rows.rows as Array<{ column_name: string; data_type: string }>)
      .map((r) => [r.column_name, r.data_type]));
    // If a future migration changes these to uuid, the `::text` casts become
    // wrong — this guard makes that decision deliberate, not silent.
    expect(types.submitter_id).toBe('text');
    expect(types.enumerator_id).toBe('text');
  });
});

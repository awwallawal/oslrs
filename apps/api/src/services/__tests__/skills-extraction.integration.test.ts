import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { lgas } from '../../db/schema/lgas.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { selectMultipleUnnest } from '../../lib/skills-extraction.js';
import { SurveyAnalyticsService } from '../survey-analytics.service.js';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';

/**
 * Story 13-22 real-DB proof (DoD (a)): seed the ACTUAL prod shape — a JSONB
 * array `["a","b","c"]` — and prove the shared `selectMultipleUnnest` fragment
 * unnests it into 3 clean tokens, not the garbage the old `string_to_array(…,' ')`
 * produced (`["tailoring",`, `"carpentry",` …). Also proves the defensive CASE:
 * a legacy space-string is split, and a non-array/non-string value yields no
 * tokens WITHOUT throwing (jsonb_array_elements_text throws on a scalar).
 *
 * Follows the project integration pattern (beforeAll/afterAll; authoritative
 * cleanup via captured ids; conflict-safe shared role; disjoint TAG keyspace so
 * it is parallel-safe with the other real-DB files).
 */

const TAG = '_skills_extract_';
const userId = uuidv7();
const lgaId = uuidv7();

// One respondent per submission (respondent_id has a uniqueness expectation in
// some consumers; keep them 1:1 to avoid cross-test coupling).
const arrayRespId = uuidv7();
const stringRespId = uuidv7();
const customRespId = uuidv7();
const scalarRespId = uuidv7();
const respIds = [arrayRespId, stringRespId, customRespId, scalarRespId];

const arraySubId = uuidv7();
const stringSubId = uuidv7();
const customSubId = uuidv7();
const scalarSubId = uuidv7();
const subIds = [arraySubId, stringSubId, customSubId, scalarSubId];

describe('selectMultipleUnnest — real-DB JSONB-array extraction (Story 13-22)', () => {
  beforeAll(async () => {
    await db.insert(lgas).values({ id: lgaId, name: `${TAG}lga`, code: `${TAG}lga` });

    await db.insert(roles).values({ id: uuidv7(), name: 'enumerator', description: `${TAG}role` }).onConflictDoNothing();
    const [{ id: roleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'enumerator')).limit(1);

    await db.insert(users).values({
      id: userId,
      email: `${TAG}${userId}@example.com`,
      fullName: 'Skills Extract Tester',
      roleId,
      lgaId,
      status: 'active',
    });

    for (const id of respIds) {
      await db.insert(respondents).values({
        id,
        lgaId: `${TAG}lga`,
        status: 'active',
        source: 'enumerator',
        submitterId: userId,
      });
    }

    const baseSub = {
      questionnaireFormId: 'skills-extract-form',
      submitterId: userId,
      enumeratorId: userId,
      completionTimeSeconds: 120,
      submittedAt: new Date(),
      source: 'webapp' as const,
    };

    await db.insert(submissions).values([
      {
        ...baseSub,
        id: arraySubId,
        submissionUid: `${TAG}${arraySubId}`,
        respondentId: arrayRespId,
        // The canonical prod shape: a JSONB array with comma-space text form.
        rawData: {
          nin: '10000000001',
          skills_possessed: ['tailoring', 'carpentry', 'welding'],
          training_interest: ['nursing', 'teaching'],
        },
      },
      {
        ...baseSub,
        id: stringSubId,
        submissionUid: `${TAG}${stringSubId}`,
        respondentId: stringRespId,
        // Legacy space-delimited scalar string (defensive fallback path).
        rawData: { nin: '10000000002', skills_possessed: 'plumbing electrical' },
      },
      {
        ...baseSub,
        id: customSubId,
        submissionUid: `${TAG}${customSubId}`,
        respondentId: customRespId,
        // Custom free-text skill must survive extraction (bucketed downstream).
        rawData: { nin: '10000000003', skills_possessed: ['masonry', 'custom_realtor'] },
      },
      {
        ...baseSub,
        id: scalarSubId,
        submissionUid: `${TAG}${scalarSubId}`,
        respondentId: scalarRespId,
        // Non-array / non-string value — must NOT throw, must yield 0 tokens.
        rawData: { nin: '10000000004', skills_possessed: 12345 },
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(submissions).where(inArray(submissions.id, subIds));
    await db.delete(respondents).where(inArray(respondents.id, respIds));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(lgas).where(eq(lgas.id, lgaId));
    // Intentionally do NOT delete the shared 'enumerator' role.
  });

  async function tokenCounts(field: 'skills_possessed' | 'training_interest') {
    const rows = await db.execute(sql`
      SELECT skill, COUNT(*)::int AS count
      FROM submissions s,
           ${selectMultipleUnnest(sql`s.raw_data`, field)} AS skill
      WHERE s.submission_uid LIKE ${TAG + '%'}
      GROUP BY skill
    `);
    const map = new Map<string, number>();
    for (const r of rows.rows as Array<{ skill: string; count: number }>) {
      map.set(String(r.skill), Number(r.count));
    }
    return map;
  }

  it('unnests a JSONB array into clean tokens (not garbage brackets/quotes)', async () => {
    const counts = await tokenCounts('skills_possessed');
    // The three array elements each appear once as clean tokens.
    expect(counts.get('tailoring')).toBe(1);
    expect(counts.get('carpentry')).toBe(1);
    expect(counts.get('welding')).toBe(1);
    // The legacy space-string is split into its two tokens.
    expect(counts.get('plumbing')).toBe(1);
    expect(counts.get('electrical')).toBe(1);
    // The masonry+custom row.
    expect(counts.get('masonry')).toBe(1);
    // AC3: custom_* skill is extracted, never dropped.
    expect(counts.get('custom_realtor')).toBe(1);

    // NO garbage tokens from JSON punctuation (the old string_to_array bug).
    for (const key of counts.keys()) {
      expect(key).not.toContain('[');
      expect(key).not.toContain(']');
      expect(key).not.toContain('"');
      expect(key).not.toContain(',');
    }
  });

  it('extracts training_interest from its JSONB array too (same serialization)', async () => {
    const counts = await tokenCounts('training_interest');
    expect(counts.get('nursing')).toBe(1);
    expect(counts.get('teaching')).toBe(1);
  });

  it('does not throw and yields no tokens for a non-array/non-string value', async () => {
    // The scalar-number row (skills_possessed: 12345) is covered by the guarded
    // CASE; if the guard were removed, jsonb_array_elements_text would throw
    // "cannot extract elements from a scalar" and fail the whole query above.
    const counts = await tokenCounts('skills_possessed');
    expect(counts.get('12345')).toBeUndefined();
  });

  it('no-regression: getSkillsInventory still resolves over the new extractor', async () => {
    const SYSTEM: AnalyticsScope = { type: 'system' };
    await expect(SurveyAnalyticsService.getSkillsInventory(SYSTEM)).resolves.toBeTruthy();
  });
});

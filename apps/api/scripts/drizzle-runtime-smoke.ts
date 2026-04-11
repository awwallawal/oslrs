/**
 * Story 9-7 Task 1.5 — Drizzle 0.30 → 0.45 runtime smoke test.
 *
 * Exercises real Drizzle SQL generation against the local dev Postgres.
 * Targets the exact query shapes known to be fragile under pg type coercion
 * (grep the services for these patterns — line numbers drift across edits):
 *   - text = uuid joins: `LEFT JOIN users u ON s.enumerator_id = u.id::text`
 *     in RespondentService.listRespondents (respondent.service.ts, listRespondents())
 *   - regex-guarded ::uuid casts in leftJoin: `s.questionnaire_form_id ~ UUID_REGEX
 *     AND s.questionnaire_form_id::uuid = qf.id` (same method)
 *   - inArray() helper patterns (assessor / fraud services post Story 9-6 refactor)
 *   - raw sql.execute() with ::uuid casts (respondent.service.ts, getSubmissionDetail())
 *
 * Runs read-only queries that return [] on empty DB — success = no SQL errors.
 */
import { db } from '../src/db/index.js';
import { submissions } from '../src/db/schema/submissions.js';
import { users } from '../src/db/schema/users.js';
import { respondents } from '../src/db/schema/respondents.js';
import { lgas } from '../src/db/schema/lgas.js';
import { fraudDetections } from '../src/db/schema/fraud-detections.js';
import { questionnaireForms } from '../src/db/schema/questionnaires.js';
import { eq, sql, desc } from 'drizzle-orm';
import { RespondentService } from '../src/services/respondent.service.js';
import { TeamQualityService } from '../src/services/team-quality.service.js';

interface Probe {
  name: string;
  run: () => Promise<unknown>;
}

const UUID_V4_REGEX_SQL = sql`'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;

const probes: Probe[] = [
  {
    name: 'text=uuid leftJoin (submissions.enumeratorId → users.id::text)',
    run: async () => db
      .select({ id: submissions.id, name: users.fullName })
      .from(submissions)
      .leftJoin(users, sql`${submissions.enumeratorId} = ${users.id}::text`)
      .limit(1),
  },
  {
    name: 'uuid regex check + ::uuid cast leftJoin (questionnaireForms)',
    run: async () => db
      .select({ id: submissions.id, form: questionnaireForms.title })
      .from(submissions)
      .leftJoin(
        questionnaireForms,
        sql`${submissions.questionnaireFormId} ~ ${UUID_V4_REGEX_SQL} AND ${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}`,
      )
      .limit(1),
  },
  {
    name: 'respondents leftJoin lgas on code (standard drizzle eq)',
    run: async () => db
      .select({ id: respondents.id, lgaName: lgas.name })
      .from(respondents)
      .leftJoin(lgas, eq(respondents.lgaId, lgas.code))
      .orderBy(desc(respondents.createdAt))
      .limit(1),
  },
  {
    name: 'inArray() helper with empty array (production pattern from assessor.service)',
    run: async () => {
      const { inArray } = await import('drizzle-orm');
      return db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, []))
        .limit(1);
    },
  },
  {
    name: 'inArray() helper with populated uuid array',
    run: async () => {
      const { inArray } = await import('drizzle-orm');
      return db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, ['00000000-0000-0000-0000-000000000000']))
        .limit(1);
    },
  },
  {
    name: 'raw sql.execute with ::uuid cast',
    run: async () => db.execute(sql`
      SELECT id FROM submissions
      WHERE respondent_id = ${'00000000-0000-0000-0000-000000000000'}::uuid
      LIMIT 1
    `),
  },
  {
    name: 'fraudDetections join on submissionId',
    run: async () => db
      .select({ sid: submissions.id, severity: fraudDetections.severity })
      .from(submissions)
      .leftJoin(fraudDetections, eq(fraudDetections.submissionId, submissions.id))
      .limit(1),
  },
  {
    name: 'RespondentService.listRespondents (super-admin scope)',
    run: async () => RespondentService.listRespondents(
      { pageSize: 1 },
      'super_admin',
      '00000000-0000-0000-0000-000000000000',
    ),
  },
  {
    name: 'RespondentService.getRespondentCount (super-admin scope)',
    run: async () => RespondentService.getRespondentCount(
      {},
      'super_admin',
      '00000000-0000-0000-0000-000000000000',
    ),
  },
  {
    name: 'TeamQualityService.resolveEnumeratorIds (system-wide)',
    run: async () => TeamQualityService.resolveEnumeratorIds(),
  },
  {
    name: 'TeamQualityService.getTeamQuality (empty scope → early return)',
    run: async () => TeamQualityService.getTeamQuality([]),
  },
];

async function main() {
  let passed = 0;
  const failures: Array<{ name: string; error: string }> = [];

  for (const probe of probes) {
    try {
      await probe.run();
      process.stdout.write(`✓ ${probe.name}\n`);
      passed += 1;
    } catch (err) {
      const error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      process.stdout.write(`✗ ${probe.name}\n  ${error}\n`);
      failures.push({ name: probe.name, error });
    }
  }

  process.stdout.write(`\n${passed}/${probes.length} probes passed\n`);
  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} failures:\n`);
    for (const f of failures) {
      process.stdout.write(`  - ${f.name}\n    ${f.error.split('\n')[0]}\n`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke harness crashed:', err);
  process.exit(2);
});

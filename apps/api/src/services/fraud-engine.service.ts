/**
 * Fraud Engine Service
 *
 * Orchestrates fraud detection: loads submission context, runs all active heuristics,
 * aggregates scores, maps severity, and returns results.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import { db } from '../db/index.js';
import { submissions, questionnaireForms, respondents } from '../db/schema/index.js';
import { eq, and, gte, isNotNull, desc, ne, sql, type SQL } from 'drizzle-orm';
import { FraudConfigService } from './fraud-config.service.js';
import { gpsClusteringHeuristic } from './fraud-heuristics/gps-clustering.heuristic.js';
import { speedRunHeuristic } from './fraud-heuristics/speed-run.heuristic.js';
import { straightLiningHeuristic } from './fraud-heuristics/straight-lining.heuristic.js';
import { duplicateResponseHeuristic } from './fraud-heuristics/duplicate-response.heuristic.js';
import { offHoursHeuristic } from './fraud-heuristics/off-hours.heuristic.js';
import { rollPaddingHeuristic } from './fraud-heuristics/roll-padding.heuristic.js';
import { getThreshold } from './fraud-heuristics/utils.js';
import type {
  FraudHeuristic,
  FraudThresholdConfig,
  FraudDetectionResult,
  FraudSeverity,
  SubmissionWithContext,
} from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'fraud-engine' });

// ── Heuristic Registry ──────────────────────────────────────────────────

/**
 * ⭐ TWO REGISTRIES, SELECTED BY PROVENANCE — Story 13-2 R-A2.
 *
 * The five field heuristics read evidence a field worker generates (GPS, completion
 * time, answer variance, submission clock, enumerator history). An imported row has
 * none of it: measured at R-A2, all five return 0 for an import, and `off_hours` is
 * actively misleading because every row in a batch shares the operator's single
 * import timestamp — it would flag 8,222 people on the clock of whoever uploaded.
 *
 * Running them anyway would write thousands of detections whose four component
 * scores are structurally meaningless, which is worse than not scoring: a reviewer
 * cannot tell "measured and clean" from "never measurable".
 */
const FIELD_HEURISTICS: FraudHeuristic[] = [
  gpsClusteringHeuristic,
  speedRunHeuristic,
  straightLiningHeuristic,
  duplicateResponseHeuristic,
  offHoursHeuristic,
];

/** Imported rows are scored ONLY on what a batch can actually evidence. */
const IMPORT_HEURISTICS: FraudHeuristic[] = [rollPaddingHeuristic];

/**
 * The sentinel `questionnaire_form_id` prefix the importer writes (`import:<source>`,
 * `import.service.ts`). It is what marks a SUBMISSION as an import — see the
 * provenance note in `loadSubmissionContext`.
 */
export const IMPORT_FORM_ID_PREFIX = 'import:';

export function heuristicsFor(context: SubmissionWithContext): FraudHeuristic[] {
  return context.importBatchId ? IMPORT_HEURISTICS : FIELD_HEURISTICS;
}

// ── Severity Mapping ────────────────────────────────────────────────────

/**
 * Map a composite score to severity level using configurable thresholds.
 */
function mapSeverity(totalScore: number, config: FraudThresholdConfig[]): FraudSeverity {
  const criticalMin = getThreshold(config, 'severity_critical_min', 85);
  const highMin = getThreshold(config, 'severity_high_min', 70);
  const mediumMin = getThreshold(config, 'severity_medium_min', 50);
  const lowMin = getThreshold(config, 'severity_low_min', 25);

  if (totalScore >= criticalMin) return 'critical';
  if (totalScore >= highMin) return 'high';
  if (totalScore >= mediumMin) return 'medium';
  if (totalScore >= lowMin) return 'low';
  return 'clean';
}

// ── FraudEngine ─────────────────────────────────────────────────────────

export class FraudEngine {
  /**
   * Evaluate a submission against all active heuristics.
   *
   * 1. Load submission + context (GPS, responses, timing, enumerator history)
   * 2. Load active thresholds (via ConfigService, Redis-cached)
   * 3. Run all active heuristics
   * 4. Aggregate scores and map severity
   */
  static async evaluate(submissionId: string): Promise<FraudDetectionResult> {
    logger.info({ event: 'fraud.engine.evaluate_start', submissionId });

    // Load active thresholds
    const allThresholds = await FraudConfigService.getActiveThresholds();
    const configVersion = await FraudConfigService.getCurrentConfigVersion();

    // Load submission with full context
    const context = await FraudEngine.loadSubmissionContext(submissionId, allThresholds);

    // Run all heuristics
    const results = await FraudEngine.runHeuristics(context, allThresholds);

    // Aggregate scores
    /*
     * 13-2 R-A2 — the `duplicate` slot takes whichever duplicate-category heuristic
     * actually ran: `duplicate_response` for a field submission, `roll_padding` for
     * an imported one. They are never both present (the registries are disjoint and
     * selected by provenance), so this is a choice between one value and zero, not
     * a merge.
     */
    const componentScores = {
      gps: results.get('gps_clustering')?.score ?? 0,
      speed: results.get('speed_run')?.score ?? 0,
      straightline: results.get('straight_lining')?.score ?? 0,
      duplicate: results.get('duplicate_response')?.score ?? results.get('roll_padding')?.score ?? 0,
      timing: results.get('off_hours')?.score ?? 0,
    };

    const componentSum =
      componentScores.gps +
      componentScores.speed +
      componentScores.straightline +
      componentScores.duplicate +
      componentScores.timing;

    /*
     * ⛔ 13-2 R-A2 REVIEW C1 — AN IMPORT IS SCORED OVER THE ONE SLOT IT CAN FILL.
     *
     * The composite is a sum of five weighted slots totalling 100, and the severity
     * cutoffs (25 / 50 / 70 / 85) are calibrated to that scale. An import runs ONLY
     * roll-padding, which fills the `duplicate` slot and is capped at
     * `duplicate_weight` (20). Summed raw, an imported row could never exceed 20 —
     * below `severity_low_min` — so every imported detection was `clean`, `clean` is
     * hidden from the fraud list by default, and the assessor queue never admits it.
     * The heuristic would have run for 8,278 people and surfaced no one.
     *
     * So an import's composite is its duplicate score as a share of the slot's
     * maximum, on the same 0–100 scale the cutoffs expect. The COMPONENT score is left
     * raw, so the stored `duplicate_score` column still means the same thing for both
     * provenances. Calibration of what that share should be is R-A8 — Awwal's call —
     * but a scale on which the heuristic cannot reach any severity is not a
     * calibration, it is a switch left off.
     */
    const duplicateSlotMax = getThreshold(allThresholds, 'duplicate_weight', 20);
    const totalScore = context.importBatchId
      ? (duplicateSlotMax > 0 ? Math.min(100, (componentScores.duplicate / duplicateSlotMax) * 100) : 0)
      : Math.min(100, componentSum);

    const severity = mapSeverity(totalScore, allThresholds);

    const result: FraudDetectionResult = {
      submissionId,
      enumeratorId: context.enumeratorId,
      importBatchId: context.importBatchId,
      configVersion,
      componentScores,
      totalScore: Math.round(totalScore * 100) / 100,
      severity,
      details: {
        gps: results.get('gps_clustering')?.details ?? null,
        speed: results.get('speed_run')?.details ?? null,
        straightline: results.get('straight_lining')?.details ?? null,
        duplicate:
          results.get('duplicate_response')?.details ?? results.get('roll_padding')?.details ?? null,
        timing: results.get('off_hours')?.details ?? null,
      },
    };

    logger.info({
      event: 'fraud.engine.evaluate_complete',
      submissionId,
      enumeratorId: context.enumeratorId,
      totalScore: result.totalScore,
      severity: result.severity,
      componentScores,
    });

    return result;
  }

  /**
   * Load the full submission context needed by all heuristics.
   */
  static async loadSubmissionContext(
    submissionId: string,
    thresholds: FraudThresholdConfig[],
  ): Promise<SubmissionWithContext> {
    // Load the submission
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    /*
     * ⛔ NO `?? ''` FALLBACK — Story 13-2 R-A2. It used to coerce a missing
     * enumerator to the empty string, which is not a uuid, so the worker's insert
     * into `fraud_detections.enumerator_id` threw `invalid input syntax for type
     * uuid: ""` and every imported job dead-lettered after three retries. An empty
     * string was also silently wrong upstream of that: `eq(enumerator_id, '')`
     * matches no rows at all (SQL null is never equal to ''), so the duplicate
     * heuristic compared every imported row against an empty history and returned
     * a confident zero.
     */
    const enumeratorId = submission.enumeratorId ?? submission.submitterId ?? null;
    const questionnaireFormId = submission.questionnaireFormId;

    /*
     * 13-2 R-A2 — provenance, and it belongs to the SUBMISSION, not to the person.
     *
     * The importer writes every submission with the sentinel form id `import:<source>`
     * (`import.service.ts`), so that is what marks a row as an import. The batch id
     * itself comes from the respondent, because the submission does not carry one.
     *
     * ⛔ Review H (2026-09-13): this used to read `respondents.import_batch_id` ALONE.
     * A person stays on their import batch forever, and `submission-processing` will
     * attach a later wizard registration or an enumerator's NIN capture to that same
     * respondent — so any field submission about an imported person ran roll-padding
     * only, and GPS / speed / straight-lining / off-hours never looked at it. An
     * enumerator fabricating visits to people already on an association roll would
     * have been unscoreable.
     */
    const isImportSubmission = questionnaireFormId?.startsWith(IMPORT_FORM_ID_PREFIX) ?? false;
    const [respondent] = isImportSubmission && submission.respondentId
      ? await db
          .select({
            importBatchId: respondents.importBatchId,
            firstName: respondents.firstName,
            lastName: respondents.lastName,
            lgaId: respondents.lgaId,
            phoneNumber: respondents.phoneNumber,
          })
          .from(respondents)
          .where(eq(respondents.id, submission.respondentId))
          .limit(1)
      : [];

    const importBatchId = respondent?.importBatchId ?? null;
    const importCohort = importBatchId
      ? await FraudEngine.loadImportCohort(importBatchId, respondent)
      : null;

    /*
     * Load form schema.
     *
     * ⛔ THE UUID GUARD IS LOAD-BEARING — found at 13-2 R-A2 by an integration test.
     * `submissions.questionnaire_form_id` is TEXT and legitimately holds SENTINELS
     * that name a channel instead of a form: `import:<source>` from the importer and
     * `supplemental-survey` from the cohort-A path. `questionnaire_forms.id` is a
     * UUID, so passing a sentinel into this lookup makes Postgres answer
     * `invalid input syntax for type uuid: "import:imported_association"` and the
     * whole evaluation throws before a single heuristic runs.
     *
     * This was latent before R-A2 only because nothing enqueued fraud for those
     * channels. Opening the gate and writing the enqueue path would have walked
     * straight into it — the third blocker in one story after the `''` enumerator
     * and the five inapplicable heuristics. A mocked test cannot see it; the cast
     * only happens in the database.
     */
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let formSchema: Record<string, unknown> | null = null;
    if (questionnaireFormId && looksLikeUuid.test(questionnaireFormId)) {
      const [form] = await db
        .select({ formSchema: questionnaireForms.formSchema })
        .from(questionnaireForms)
        .where(eq(questionnaireForms.id, questionnaireFormId))
        .limit(1);
      formSchema = (form?.formSchema as Record<string, unknown>) ?? null;
    }

    // Load enumerator's recent submissions (for GPS clustering, speed median, duplicate detection)
    const timeWindowHours = thresholds.find((t) => t.ruleKey === 'gps_cluster_time_window_h')?.thresholdValue ?? 4;
    const lookbackDays = thresholds.find((t) => t.ruleKey === 'duplicate_lookback_days')?.thresholdValue ?? 7;
    const lookbackMs = Math.max(timeWindowHours * 3600000, lookbackDays * 86400000);
    const cutoff = new Date(Date.now() - lookbackMs);

    const recentSubmissions = enumeratorId === null ? [] : await db
      .select({
        id: submissions.id,
        submittedAt: submissions.submittedAt,
        gpsLatitude: submissions.gpsLatitude,
        gpsLongitude: submissions.gpsLongitude,
        completionTimeSeconds: submissions.completionTimeSeconds,
        rawData: submissions.rawData,
        enumeratorId: submissions.enumeratorId,
        questionnaireFormId: submissions.questionnaireFormId,
      })
      .from(submissions)
      .where(and(
        eq(submissions.enumeratorId, enumeratorId),
        gte(submissions.submittedAt, cutoff),
        ne(submissions.id, submissionId),
      ))
      .orderBy(desc(submissions.submittedAt))
      .limit(100);

    // Load nearby submissions from OTHER enumerators (for duplicate coordinate detection)
    // Only if current submission has GPS
    let nearbySubmissions: SubmissionWithContext['nearbySubmissions'] = [];
    // 13-2 R-A2: `enumeratorId` may be null (an import). "Other enumerators' nearby
    // submissions" has no meaning without a `self` to exclude, and an import has no
    // GPS anyway, so the whole block is enumerator-scoped by construction.
    if (enumeratorId !== null && submission.gpsLatitude != null && submission.gpsLongitude != null) {
      const gpsCutoff = new Date(Date.now() - timeWindowHours * 3600000);
      const nearby = await db
        .select({
          id: submissions.id,
          enumeratorId: submissions.enumeratorId,
          submittedAt: submissions.submittedAt,
          gpsLatitude: submissions.gpsLatitude,
          gpsLongitude: submissions.gpsLongitude,
        })
        .from(submissions)
        .where(and(
          gte(submissions.submittedAt, gpsCutoff),
          isNotNull(submissions.gpsLatitude),
          isNotNull(submissions.gpsLongitude),
          ne(submissions.id, submissionId),
          ne(submissions.enumeratorId, enumeratorId),
        ))
        .limit(200);

      nearbySubmissions = nearby.map((s) => ({
        id: s.id,
        enumeratorId: s.enumeratorId ?? '',
        submittedAt: s.submittedAt.toISOString(),
        gpsLatitude: s.gpsLatitude,
        gpsLongitude: s.gpsLongitude,
      }));
    }

    return {
      submissionId,
      enumeratorId,
      questionnaireFormId,
      submittedAt: submission.submittedAt.toISOString(),
      gpsLatitude: submission.gpsLatitude,
      gpsLongitude: submission.gpsLongitude,
      completionTimeSeconds: submission.completionTimeSeconds,
      rawData: (submission.rawData as Record<string, unknown>) ?? null,
      formSchema,
      importBatchId,
      importCohort,
      recentSubmissions: recentSubmissions.map((s) => ({
        id: s.id,
        submittedAt: s.submittedAt.toISOString(),
        gpsLatitude: s.gpsLatitude,
        gpsLongitude: s.gpsLongitude,
        completionTimeSeconds: s.completionTimeSeconds,
        rawData: (s.rawData as Record<string, unknown>) ?? null,
        enumeratorId: s.enumeratorId ?? '',
        questionnaireFormId: s.questionnaireFormId,
      })),
      nearbySubmissions,
    };
  }

  /**
   * 13-2 R-A2 — the roll-padding counts for one imported row.
   *
   * ⭐ COUNTS, NOT ROWS, AND THAT IS THE WHOLE DESIGN. The obvious shape is "load
   * this row's batch siblings and compare" — but a batch is up to 8,222 rows and
   * every row is its own job, so that is 8,222 loads of 8,222 rows on a 2 GB box
   * where all ten BullMQ workers run IN the API process. One aggregate over the
   * batch per job returns three counts instead, and keeps the heuristic pure, which
   * the `FraudHeuristic` contract requires.
   *
   * ⚠️ It is NOT flat, and an earlier version of this comment said it was. The batch
   * is found through `idx_respondents_import_batch`, but every row of it is then
   * normalised in the FILTER, so each job is O(batch) and a full run is O(batch²)
   * row-evaluations. Measured on the review's synthetic 8,222-row batch — see the
   * story's R-A2 review record — before trusting it on prod.
   *
   * The identity key is the name's lower-cased TOKENS, sorted, scoped to the batch
   * and the LGA. It is deliberately coarse: 13-2 R-A6 records that name ORDER is
   * unreliable for the 5,301 NCARES rows, so "Tunde Bakare" and "Bakare Tunde" must
   * be one key. (Review M, 2026-09-13: the previous key compared `first || ' ' ||
   * last` as a string, which cited R-A6 and then split exactly those pairs apart.)
   */
  static async loadImportCohort(
    batchId: string,
    respondent: { firstName: string | null; lastName: string | null; lgaId: string | null; phoneNumber: string | null } | undefined,
  ): Promise<SubmissionWithContext['importCohort']> {
    /*
     * ⛔ INTERNAL WHITESPACE IS COLLAPSED, NOT JUST TRIMMED. These names come off
     * transcribed sheets: 13-2 R-A6 records that name ORDER is already unreliable
     * for the 5,301 NCARES rows, and double spaces and stray padding are ordinary in
     * the same data. A key that treats "Ade  Bello" and "Ade Bello" as different
     * people splits a duplicate cluster in two and under-counts padding EXACTLY
     * where a padder's sloppy data entry would put it.
     */
    /*
     * ⛔ ONE NORMALISER, APPLIED IN SQL TO BOTH SIDES. The key sorts tokens, and a JS
     * `sort()` and a Postgres `ORDER BY` do not promise the same collation — build
     * the key in JS and compare it to a key built in SQL, and a name with a
     * non-ASCII letter can sort differently on each side and silently never match.
     * So this row's name is passed as parameters and normalised by the SAME
     * expression as its batch siblings.
     *
     * ⚠️ '\\s+' is DOUBLE-escaped on purpose: this is a JS template literal, where a
     * lone \s collapses to 's' before Postgres ever sees it. Written singly, the
     * split became `regexp_split_to_array(..., 's+')` and mangled every name
     * containing the letter s. (Verified by mutation at review: two tests red.)
     */
    const identityKeySql = (first: SQL | string | null, last: SQL | string | null): SQL => sql`
      array_to_string(ARRAY(
        SELECT tok FROM unnest(regexp_split_to_array(
          lower(btrim(coalesce(${first}, '') || ' ' || coalesce(${last}, ''))),
          '\\s+'
        )) AS tok
        WHERE tok <> ''
        ORDER BY tok
      ), ' ')`;
    const selfKey = identityKeySql(respondent?.firstName ?? null, respondent?.lastName ?? null);
    const siblingKey = identityKeySql(sql`r.first_name`, sql`r.last_name`);

    const result = (await db.execute(sql`
      WITH self AS (SELECT ${selfKey} AS key)
      SELECT
        count(*) AS batch_size,
        count(*) FILTER (
          WHERE (SELECT key FROM self) <> ''
            AND ${siblingKey} = (SELECT key FROM self)
            AND r.lga_id IS NOT DISTINCT FROM ${respondent?.lgaId ?? null}
        ) AS same_identity,
        count(*) FILTER (
          WHERE ${respondent?.phoneNumber ?? null}::text IS NOT NULL
            AND r.phone_number = ${respondent?.phoneNumber ?? null}
        ) AS same_phone
      FROM respondents r
      WHERE r.import_batch_id = ${batchId}
    `)) as { rows: Array<Record<string, string | number>> };

    const row = result.rows[0] ?? {};
    const n = (k: string): number => Number(row[k] ?? 0);

    return {
      batchSize: n('batch_size'),
      sameIdentityCount: n('same_identity'),
      // Null, not 0, when the row has no phone — "not measurable" must not read as
      // "measured and unique".
      samePhoneCount: respondent?.phoneNumber ? n('same_phone') : null,
    };
  }

  /**
   * Run all registered heuristics against a submission context.
   */
  static async runHeuristics(
    context: SubmissionWithContext,
    allThresholds: FraudThresholdConfig[],
  ): Promise<Map<string, { score: number; details: Record<string, unknown> }>> {
    const results = new Map<string, { score: number; details: Record<string, unknown> }>();

    // Filter thresholds by category for each heuristic
    for (const heuristic of heuristicsFor(context)) {
      // Check if heuristic is active (any active threshold in its category)
      const categoryThresholds = allThresholds.filter((t) => t.ruleCategory === heuristic.category);

      // Skip disabled heuristics (all thresholds inactive)
      if (categoryThresholds.length > 0 && categoryThresholds.every((t) => !t.isActive)) {
        results.set(heuristic.key, { score: 0, details: { reason: 'heuristic_disabled' } });
        continue;
      }

      try {
        const result = await heuristic.evaluate(context, categoryThresholds);
        results.set(heuristic.key, result);

        logger.debug({
          event: 'fraud.heuristic.evaluated',
          heuristic: heuristic.key,
          category: heuristic.category,
          score: result.score,
          submissionId: context.submissionId,
        });
      } catch (err) {
        logger.error({
          event: 'fraud.heuristic.error',
          heuristic: heuristic.key,
          submissionId: context.submissionId,
          error: String(err),
        });
        // Continue with other heuristics — one failure shouldn't block all scoring
        results.set(heuristic.key, { score: 0, details: { error: String(err) } });
      }
    }

    return results;
  }
}

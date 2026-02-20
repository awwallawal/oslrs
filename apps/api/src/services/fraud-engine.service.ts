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
import { submissions, questionnaireForms } from '../db/schema/index.js';
import { eq, and, gte, isNotNull, desc, ne } from 'drizzle-orm';
import { FraudConfigService } from './fraud-config.service.js';
import { gpsClusteringHeuristic } from './fraud-heuristics/gps-clustering.heuristic.js';
import { speedRunHeuristic } from './fraud-heuristics/speed-run.heuristic.js';
import { straightLiningHeuristic } from './fraud-heuristics/straight-lining.heuristic.js';
import { duplicateResponseHeuristic } from './fraud-heuristics/duplicate-response.heuristic.js';
import { offHoursHeuristic } from './fraud-heuristics/off-hours.heuristic.js';
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

const heuristicRegistry: FraudHeuristic[] = [
  gpsClusteringHeuristic,
  speedRunHeuristic,
  straightLiningHeuristic,
  duplicateResponseHeuristic,
  offHoursHeuristic,
];

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
    const componentScores = {
      gps: results.get('gps_clustering')?.score ?? 0,
      speed: results.get('speed_run')?.score ?? 0,
      straightline: results.get('straight_lining')?.score ?? 0,
      duplicate: results.get('duplicate_response')?.score ?? 0,
      timing: results.get('off_hours')?.score ?? 0,
    };

    const totalScore = Math.min(
      100,
      componentScores.gps +
      componentScores.speed +
      componentScores.straightline +
      componentScores.duplicate +
      componentScores.timing,
    );

    const severity = mapSeverity(totalScore, allThresholds);

    const result: FraudDetectionResult = {
      submissionId,
      enumeratorId: context.enumeratorId,
      configVersion,
      componentScores,
      totalScore: Math.round(totalScore * 100) / 100,
      severity,
      details: {
        gps: results.get('gps_clustering')?.details ?? null,
        speed: results.get('speed_run')?.details ?? null,
        straightline: results.get('straight_lining')?.details ?? null,
        duplicate: results.get('duplicate_response')?.details ?? null,
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

    const enumeratorId = submission.enumeratorId ?? submission.submitterId ?? '';
    const questionnaireFormId = submission.questionnaireFormId;

    // Load form schema
    let formSchema: Record<string, unknown> | null = null;
    if (questionnaireFormId) {
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

    const recentSubmissions = await db
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
    if (submission.gpsLatitude != null && submission.gpsLongitude != null) {
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
   * Run all registered heuristics against a submission context.
   */
  static async runHeuristics(
    context: SubmissionWithContext,
    allThresholds: FraudThresholdConfig[],
  ): Promise<Map<string, { score: number; details: Record<string, unknown> }>> {
    const results = new Map<string, { score: number; details: Record<string, unknown> }>();

    // Filter thresholds by category for each heuristic
    for (const heuristic of heuristicRegistry) {
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

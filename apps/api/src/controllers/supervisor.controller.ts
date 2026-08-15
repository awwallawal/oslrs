import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { submissions } from '../db/schema/submissions.js';
import { sql, inArray } from 'drizzle-orm';
import { TeamAssignmentService } from '../services/team-assignment.service.js';
import {
  SQL_SUBMISSION_AWAITING,
  SQL_SUBMISSION_HAS_REASON,
} from '../services/submission-terminal-state.js'; // Story 13-57 (AC2.3)

export class SupervisorController {
  /**
   * GET /api/v1/supervisor/team-overview
   * Returns enumerator counts (total, active, inactive) for the supervisor's assigned team.
   * Uses TeamAssignmentService for assignment boundary enforcement.
   */
  static async getTeamOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({ data: { total: 0, active: 0, inactive: 0 } });
      }

      // The assignment service returns only active/verified enumerators,
      // so total = active and inactive = 0. This is correct: inactive
      // enumerators are excluded from the supervisor's operational team.
      const total = enumeratorIds.length;
      res.json({ data: { total, active: total, inactive: 0 } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/team-metrics
   * Returns per-enumerator roster with daily/weekly counts and last activity.
   * Uses TeamAssignmentService for assignment boundary enforcement (AC 4.1.2).
   */
  static async getTeamMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({ data: { enumerators: [] } });
      }

      // Get enumerator details
      const enumeratorDetails = await db.query.users.findMany({
        where: inArray(users.id, enumeratorIds),
        columns: { id: true, fullName: true, status: true, lastLoginAt: true },
      });

      // Get daily + weekly counts and last submission per enumerator.
      // Use WAT (UTC+1) boundary so "today" aligns with Nigeria local time.
      const WAT_OFFSET_MS = 1 * 60 * 60 * 1000; // UTC+1
      const now = new Date();
      const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
      const todayStart = new Date(Date.UTC(watNow.getUTCFullYear(), watNow.getUTCMonth(), watNow.getUTCDate()));
      todayStart.setTime(todayStart.getTime() - WAT_OFFSET_MS); // Convert back to UTC
      const weekStart = new Date(todayStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);

      const countRows = await db
        .select({
          submitterId: submissions.submitterId,
          dailyCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${todayStart})`,
          weeklyCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${weekStart})`,
          lastSubmittedAt: sql<string>`MAX(${submissions.submittedAt})`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, enumeratorIds))
        .groupBy(submissions.submitterId);

      // Build counts map for O(1) lookup
      const countsMap = new Map(
        countRows.map((r) => [
          r.submitterId,
          {
            dailyCount: Number(r.dailyCount),
            weeklyCount: Number(r.weeklyCount),
            lastSubmittedAt: r.lastSubmittedAt,
          },
        ]),
      );

      // Merge enumerator details with counts
      const enumerators = enumeratorDetails.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        status: e.status,
        lastLoginAt: e.lastLoginAt,
        dailyCount: countsMap.get(e.id)?.dailyCount ?? 0,
        weeklyCount: countsMap.get(e.id)?.weeklyCount ?? 0,
        lastSubmittedAt: countsMap.get(e.id)?.lastSubmittedAt ?? null,
      }));

      res.json({ data: { enumerators } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/team-gps
   * Returns latest GPS point per assigned enumerator.
   * Uses DISTINCT ON for efficient "latest per group" query (AC 4.1.3).
   */
  static async getTeamGps(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({ data: { points: [] } });
      }

      // DISTINCT ON to get latest GPS per enumerator — no N+1 queries
      const idList = sql.join(
        enumeratorIds.map((id) => sql`${id}`),
        sql`, `,
      );

      // Join in TEXT space (`u.id::text = s.submitter_id`): `submitter_id` is a
      // TEXT column, so casting IT to uuid can abort the whole statement with
      // `22P02 invalid input syntax for type uuid` if any row ever holds a
      // non-UUID value — the WHERE filter does not protect the JOIN, because
      // Postgres imposes no evaluation order between them. Same defect class
      // fixed in respondent.service (2026-07-22), where the equivalent cast on
      // `questionnaire_form_id` DID 500 against real sentinel values. No writer
      // produces a non-UUID `submitter_id` today, so this one is prophylactic.
      const points = await db.execute(sql`
        SELECT DISTINCT ON (s.submitter_id)
          s.submitter_id AS "enumeratorId",
          u.full_name AS "enumeratorName",
          s.gps_latitude AS "latitude",
          s.gps_longitude AS "longitude",
          s.submitted_at AS "submittedAt"
        FROM submissions s
        JOIN users u ON u.id::text = s.submitter_id
        WHERE s.submitter_id IN (${idList})
          AND s.gps_latitude IS NOT NULL
          AND s.gps_longitude IS NOT NULL
        ORDER BY s.submitter_id, s.submitted_at DESC
      `);

      res.json({ data: { points: points.rows } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/pending-alerts
   * Returns unprocessed and failed submission counts for the supervisor's assigned team.
   * Uses TeamAssignmentService for assignment boundary enforcement.
   */
  static async getPendingAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({
          data: { unprocessedCount: 0, failedCount: 0, totalAlerts: 0 },
        });
      }

      /**
       * ⛔ STORY 13-57 — THIS COUNTER COULD NOT REACH THE FAILURES IT NAMES.
       *
       * `failedCount` read `processing_error IS NOT NULL AND processed = true`.
       * The dead rows this story exists for were `processed = FALSE` — a
       * submission whose respondent write threw was left looking queued — so a
       * supervisor's "failed" alert was structurally incapable of counting
       * them. It would have kept reading zero even after the column started
       * being written ([[pattern-monitor-measuring-something-else]]).
       *
       * The predicate is now the discriminator itself: a submission has FAILED
       * when it carries a reason, whatever `processed` says. That covers the
       * terminal rows this story writes (`processed = true` + reason) AND any
       * historical row that acquired a reason without the flag.
       *
       * `unprocessedCount` gains `AND processing_error IS NULL` so the two
       * remain DISJOINT — without it a failed row would be counted twice in
       * `totalAlerts`, and "3 alerts" for 2 problems is its own small lie.
       *
       * ⚠️ THIS COUNTER USES `HAS_REASON`, NOT `DEAD` — and the difference is
       * deliberate (code review 2026-08-14, H1). The digest had to start
       * excluding duplicate-NIN rejections, because it makes a claim about
       * PEOPLE ("these are NOT on the register") that is false for them. A
       * supervisor's queue makes a narrower claim: "the pipeline finished with
       * this and it did not become a respondent here", which is true of a
       * duplicate too, and a supervisor is exactly who should see one. Same
       * shared vocabulary, different question — so it binds to a different
       * predicate rather than quietly reusing the wrong one.
       */
      const rows = await db
        .select({
          unprocessedCount: sql<number>`COUNT(*) FILTER (WHERE ${sql.raw(SQL_SUBMISSION_AWAITING)})`,
          failedCount: sql<number>`COUNT(*) FILTER (WHERE ${sql.raw(SQL_SUBMISSION_HAS_REASON)})`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, enumeratorIds));

      const result = rows[0] ?? { unprocessedCount: 0, failedCount: 0 };
      const unprocessedCount = Number(result.unprocessedCount);
      const failedCount = Number(result.failedCount);

      res.json({
        data: {
          unprocessedCount,
          failedCount,
          totalAlerts: unprocessedCount + failedCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

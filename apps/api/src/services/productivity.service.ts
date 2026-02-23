/**
 * Productivity Service
 *
 * Main service for team productivity data.
 * Extends getTeamMetrics pattern from supervisor.controller.ts.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 */

import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { submissions } from '../db/schema/submissions.js';
import { fraudDetections } from '../db/schema/fraud-detections.js';
import { dailyProductivitySnapshots } from '../db/schema/daily-productivity-snapshots.js';
import { sql, inArray, and, gte, lte, eq } from 'drizzle-orm';
import { TeamAssignmentService } from './team-assignment.service.js';
import { ProductivityTargetService } from './productivity-target.service.js';
import type {
  StaffProductivityRow,
  ProductivityFilterParams,
  ProductivitySummary,
  ProductivityStatus,
  ProductivityTrend,
} from '@oslsr/types';

/** WAT = UTC+1 offset in milliseconds */
const WAT_OFFSET_MS = 1 * 60 * 60 * 1000;

interface WatBoundaries {
  todayStart: Date;
  weekStart: Date;
  monthStart: Date;
}

/** Calculate WAT (UTC+1) day/week/month boundaries */
function getWatBoundaries(referenceDate?: Date): WatBoundaries {
  const now = referenceDate ?? new Date();
  const watNow = new Date(now.getTime() + WAT_OFFSET_MS);

  // Today start (midnight WAT in UTC)
  const todayWat = new Date(watNow);
  todayWat.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(todayWat.getTime() - WAT_OFFSET_MS);

  // Week start (Monday midnight WAT in UTC)
  const day = watNow.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekWat = new Date(watNow);
  weekWat.setUTCDate(weekWat.getUTCDate() - diff);
  weekWat.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(weekWat.getTime() - WAT_OFFSET_MS);

  // Month start (1st of month midnight WAT in UTC)
  const monthWat = new Date(watNow);
  monthWat.setUTCDate(1);
  monthWat.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(monthWat.getTime() - WAT_OFFSET_MS);

  return { todayStart, weekStart, monthStart };
}

/** Get WAT date string (YYYY-MM-DD) for a given UTC timestamp */
function getWatDateString(date: Date): string {
  const watDate = new Date(date.getTime() + WAT_OFFSET_MS);
  return watDate.toISOString().split('T')[0];
}

/**
 * Compute status indicator per AC #4
 */
export function computeStatus(
  todayCount: number,
  target: number,
  lastActiveAt: Date | string | null,
  referenceDate?: Date,
): ProductivityStatus {
  if (todayCount >= target) return 'complete';

  const now = referenceDate ?? new Date();
  const watHour = (now.getUTCHours() + 1) % 24;

  // Check inactive: 0 today AND last active > 24h
  if (todayCount === 0 && lastActiveAt) {
    const lastDate = typeof lastActiveAt === 'string' ? new Date(lastActiveAt) : lastActiveAt;
    const hoursSinceActive = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive > 24) return 'inactive';
  }
  if (todayCount === 0 && !lastActiveAt) return 'inactive';

  // Outside work hours: can't project
  if (watHour < 8 || watHour >= 17) return 'behind';

  // Projection: will current pace reach target by 5pm?
  const hoursElapsed = watHour - 8;
  if (hoursElapsed === 0) return 'on_track'; // Start of workday
  const hoursRemaining = 17 - watHour;
  const projectedAdditional = (todayCount / hoursElapsed) * hoursRemaining;
  return (todayCount + projectedAdditional >= target) ? 'on_track' : 'behind';
}

/**
 * Compute trend: compare current vs previous period average
 */
export function computeTrend(currentAvg: number, previousAvg: number): ProductivityTrend {
  if (previousAvg === 0) return currentAvg > 0 ? 'up' : 'flat';
  const changePercent = ((currentAvg - previousAvg) / previousAvg) * 100;
  if (changePercent > 5) return 'up';
  if (changePercent < -5) return 'down';
  return 'flat';
}

interface TeamProductivityResult {
  rows: StaffProductivityRow[];
  summary: ProductivitySummary;
  totalItems: number;
}

export class ProductivityService {
  /**
   * Get team productivity data for a supervisor.
   * For super_admin, pass null to get all staff.
   */
  static async getTeamProductivity(
    supervisorId: string | null,
    filters: ProductivityFilterParams,
  ): Promise<TeamProductivityResult> {
    // Get enumerator IDs based on role
    let enumeratorIds: string[];
    if (supervisorId) {
      enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(supervisorId);
    } else {
      // Super admin: get all active enumerators + data entry clerks
      const allStaff = await db.query.users.findMany({
        where: inArray(users.status, ['active', 'verified']),
        with: { role: true },
        columns: { id: true },
      });
      enumeratorIds = allStaff
        .filter((u) => u.role?.name === 'enumerator' || u.role?.name === 'data_entry_clerk')
        .map((u) => u.id);
    }

    if (enumeratorIds.length === 0) {
      return {
        rows: [],
        summary: {
          totalSubmissions: 0, avgPerDay: 0, totalTarget: 0,
          overallPercent: 0, completedCount: 0, behindCount: 0, inactiveCount: 0,
        },
        totalItems: 0,
      };
    }

    // Get enumerator details
    const enumeratorDetails = await db.query.users.findMany({
      where: inArray(users.id, enumeratorIds),
      columns: { id: true, fullName: true, status: true, lastLoginAt: true, lgaId: true },
    });

    const boundaries = getWatBoundaries();

    // Live "Today" query
    const liveCounts = await db
      .select({
        submitterId: submissions.submitterId,
        todayCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${boundaries.todayStart})`,
        lastSubmittedAt: sql<string>`MAX(${submissions.submittedAt})`,
      })
      .from(submissions)
      .where(inArray(submissions.submitterId, enumeratorIds))
      .groupBy(submissions.submitterId);

    const liveCountMap = new Map(
      liveCounts.map((r) => [
        r.submitterId,
        { todayCount: Number(r.todayCount), lastSubmittedAt: r.lastSubmittedAt },
      ]),
    );

    // Week + Month from snapshots
    const weekDateStr = getWatDateString(boundaries.weekStart);
    const monthDateStr = getWatDateString(boundaries.monthStart);

    const snapshotAggs = await db
      .select({
        userId: dailyProductivitySnapshots.userId,
        weekCount: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${weekDateStr} THEN ${dailyProductivitySnapshots.submissionCount} ELSE 0 END)`,
        monthCount: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${monthDateStr} THEN ${dailyProductivitySnapshots.submissionCount} ELSE 0 END)`,
        weekApproved: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${weekDateStr} THEN ${dailyProductivitySnapshots.approvedCount} ELSE 0 END)`,
        weekRejected: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${weekDateStr} THEN ${dailyProductivitySnapshots.rejectedCount} ELSE 0 END)`,
        monthApproved: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${monthDateStr} THEN ${dailyProductivitySnapshots.approvedCount} ELSE 0 END)`,
        monthRejected: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${monthDateStr} THEN ${dailyProductivitySnapshots.rejectedCount} ELSE 0 END)`,
        daysActive: sql<number>`COUNT(DISTINCT CASE WHEN ${dailyProductivitySnapshots.submissionCount} > 0 AND ${dailyProductivitySnapshots.date} >= ${weekDateStr} THEN ${dailyProductivitySnapshots.date} END)`,
      })
      .from(dailyProductivitySnapshots)
      .where(and(
        inArray(dailyProductivitySnapshots.userId, enumeratorIds),
        gte(dailyProductivitySnapshots.date, monthDateStr),
      ))
      .groupBy(dailyProductivitySnapshots.userId);

    const snapshotMap = new Map(
      snapshotAggs.map((r) => [r.userId, {
        weekCount: Number(r.weekCount) || 0,
        monthCount: Number(r.monthCount) || 0,
        weekApproved: Number(r.weekApproved) || 0,
        weekRejected: Number(r.weekRejected) || 0,
        monthApproved: Number(r.monthApproved) || 0,
        monthRejected: Number(r.monthRejected) || 0,
        daysActive: Number(r.daysActive) || 0,
      }]),
    );

    // Get live approved/rejected for today from fraud_detections
    const todayFraudCounts = await db
      .select({
        enumeratorId: fraudDetections.enumeratorId,
        approvedCount: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.severity} = 'clean' OR ${fraudDetections.resolution} IN ('false_positive', 'dismissed'))`,
        rejectedCount: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} = 'confirmed_fraud')`,
      })
      .from(fraudDetections)
      .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
      .where(and(
        inArray(fraudDetections.enumeratorId, enumeratorIds),
        gte(submissions.submittedAt, boundaries.todayStart),
      ))
      .groupBy(fraudDetections.enumeratorId);

    const todayFraudMap = new Map(
      todayFraudCounts.map((r) => [r.enumeratorId, {
        approved: Number(r.approvedCount) || 0,
        rejected: Number(r.rejectedCount) || 0,
      }]),
    );

    // Previous period snapshots for trend
    const prevWeekStart = new Date(boundaries.weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const prevWeekDateStr = getWatDateString(prevWeekStart);

    const prevSnapshotAggs = await db
      .select({
        userId: dailyProductivitySnapshots.userId,
        prevWeekTotal: sql<number>`SUM(${dailyProductivitySnapshots.submissionCount})`,
        prevWeekDays: sql<number>`COUNT(DISTINCT ${dailyProductivitySnapshots.date})`,
      })
      .from(dailyProductivitySnapshots)
      .where(and(
        inArray(dailyProductivitySnapshots.userId, enumeratorIds),
        gte(dailyProductivitySnapshots.date, prevWeekDateStr),
        lte(dailyProductivitySnapshots.date, weekDateStr),
      ))
      .groupBy(dailyProductivitySnapshots.userId);

    const prevSnapshotMap = new Map(
      prevSnapshotAggs.map((r) => [r.userId, {
        total: Number(r.prevWeekTotal) || 0,
        days: Number(r.prevWeekDays) || 1,
      }]),
    );

    // Calculate working days in current week
    const now = new Date();
    const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
    const dayOfWeek = watNow.getUTCDay();
    const workingDaysThisWeek = dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5); // Mon-Fri

    // Fetch targets once before the loop (M4 review fix: eliminate N+1)
    const activeTargets = await ProductivityTargetService.getActiveTargets();

    // Build rows
    let allRows: StaffProductivityRow[] = [];

    for (const enumerator of enumeratorDetails) {
      const live = liveCountMap.get(enumerator.id);
      const snap = snapshotMap.get(enumerator.id);
      const todayFraud = todayFraudMap.get(enumerator.id);
      const prevSnap = prevSnapshotMap.get(enumerator.id);

      // Look up target from pre-fetched data (no per-iteration DB call)
      const lgaOverride = enumerator.lgaId
        ? activeTargets.lgaOverrides.find((o) => o.lgaId === enumerator.lgaId)
        : undefined;
      const target = lgaOverride?.dailyTarget ?? activeTargets.defaultTarget;
      const todayCount = live?.todayCount ?? 0;

      // Combine today's live + historical snapshot counts
      const weekCount = (snap?.weekCount ?? 0) + todayCount;
      const monthCount = (snap?.monthCount ?? 0) + todayCount;
      const weekTarget = target * workingDaysThisWeek;
      const monthTarget = target * 22; // ~22 working days per month

      // Approved/rejected: period-aware (H1 review fix)
      let approvedCount: number;
      let rejectedCount: number;
      if (filters.period === 'today') {
        approvedCount = todayFraud?.approved ?? 0;
        rejectedCount = todayFraud?.rejected ?? 0;
      } else if (filters.period === 'month' || filters.period === 'custom') {
        approvedCount = (todayFraud?.approved ?? 0) + (snap?.monthApproved ?? 0);
        rejectedCount = (todayFraud?.rejected ?? 0) + (snap?.monthRejected ?? 0);
      } else {
        // 'week' (default)
        approvedCount = (todayFraud?.approved ?? 0) + (snap?.weekApproved ?? 0);
        rejectedCount = (todayFraud?.rejected ?? 0) + (snap?.weekRejected ?? 0);
      }
      const totalForRejRate = approvedCount + rejectedCount;
      const rejRate = totalForRejRate > 0 ? Math.round((rejectedCount / totalForRejRate) * 100) : 0;

      // Last active: use last submission or last login
      const lastActiveAt = live?.lastSubmittedAt ?? enumerator.lastLoginAt?.toISOString() ?? null;

      // Status
      const status = computeStatus(todayCount, target, lastActiveAt);

      // Trend: current week avg vs previous week avg
      const currentWeekDays = Math.max(workingDaysThisWeek, 1);
      const currentWeekAvg = weekCount / currentWeekDays;
      const prevWeekAvg = prevSnap ? prevSnap.total / Math.max(prevSnap.days, 1) : 0;
      const trend = computeTrend(currentWeekAvg, prevWeekAvg);

      // Days active
      const daysActive = `${(snap?.daysActive ?? 0) + (todayCount > 0 ? 1 : 0)}/${workingDaysThisWeek}`;

      const percent = target > 0 ? Math.round((todayCount / target) * 100) : 0;

      allRows.push({
        id: enumerator.id,
        fullName: enumerator.fullName,
        todayCount,
        target,
        percent,
        status,
        trend,
        weekCount,
        weekTarget,
        monthCount,
        monthTarget,
        approvedCount,
        rejectedCount,
        rejRate,
        daysActive,
        lastActiveAt,
      });
    }

    // Apply filters
    if (filters.status && filters.status !== 'all') {
      allRows = allRows.filter((r) => r.status === filters.status);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      allRows = allRows.filter((r) => r.fullName.toLowerCase().includes(searchLower));
    }

    // Sort
    const sortBy = filters.sortBy ?? 'fullName';
    const sortOrder = filters.sortOrder ?? 'asc';
    allRows.sort((a, b) => {
      const aVal = a[sortBy as keyof StaffProductivityRow];
      const bVal = b[sortBy as keyof StaffProductivityRow];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal);
      const numB = Number(bVal);
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    const totalItems = allRows.length;

    // Summary (before pagination)
    const totalSubmissions = allRows.reduce((sum, r) => sum + r.todayCount, 0);
    const totalTarget = allRows.reduce((sum, r) => sum + r.target, 0);
    const summary: ProductivitySummary = {
      totalSubmissions,
      avgPerDay: totalItems > 0 ? Math.round(totalSubmissions / totalItems) : 0,
      totalTarget,
      overallPercent: totalTarget > 0 ? Math.round((totalSubmissions / totalTarget) * 100) : 0,
      completedCount: allRows.filter((r) => r.status === 'complete').length,
      behindCount: allRows.filter((r) => r.status === 'behind').length,
      inactiveCount: allRows.filter((r) => r.status === 'inactive').length,
    };

    // Paginate
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const paginatedRows = allRows.slice(offset, offset + pageSize);

    return { rows: paginatedRows, summary, totalItems };
  }
}

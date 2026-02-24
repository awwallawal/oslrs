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
import { roles } from '../db/schema/roles.js';
import { lgas } from '../db/schema/lgas.js';
import { submissions } from '../db/schema/submissions.js';
import { fraudDetections } from '../db/schema/fraud-detections.js';
import { dailyProductivitySnapshots } from '../db/schema/daily-productivity-snapshots.js';
import { teamAssignments } from '../db/schema/team-assignments.js';
import { sql, inArray, and, gte, lte, eq, isNull, or } from 'drizzle-orm';
import { TeamAssignmentService } from './team-assignment.service.js';
import { ProductivityTargetService } from './productivity-target.service.js';
import type {
  StaffProductivityRow,
  ProductivityFilterParams,
  ProductivitySummary,
  ProductivityStatus,
  ProductivityTrend,
  StaffProductivityRowExtended,
  CrossLgaFilterParams,
  LgaProductivityRow,
  LgaAggregateSummaryRow,
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

  /**
   * Story 5.6b: Get all staff productivity across all LGAs (Super Admin).
   * Returns enumerators, clerks, and supervisors with role/LGA/supervisor info.
   * Supervisors show review throughput instead of submission count.
   */
  static async getAllStaffProductivity(
    filters: CrossLgaFilterParams,
  ): Promise<{ rows: StaffProductivityRowExtended[]; summary: ProductivitySummary & { supervisorlessLgaCount: number }; totalItems: number }> {
    // Get all active staff with enumerator, data_entry_clerk, or supervisor roles
    const allStaff = await db.query.users.findMany({
      where: inArray(users.status, ['active', 'verified']),
      with: { role: true, lga: true },
      columns: { id: true, fullName: true, status: true, lastLoginAt: true, lgaId: true, roleId: true },
    });

    const fieldRoles = ['enumerator', 'data_entry_clerk', 'supervisor'];
    let staffList = allStaff.filter((u) => u.role && fieldRoles.includes(u.role.name));

    // Apply LGA filter
    if (filters.lgaIds && filters.lgaIds.length > 0) {
      staffList = staffList.filter((u) => u.lgaId && filters.lgaIds!.includes(u.lgaId));
    }

    // Apply role filter
    if (filters.roleId && filters.roleId !== 'all') {
      staffList = staffList.filter((u) => u.role?.name === filters.roleId);
    }

    // Apply supervisor filter
    if (filters.supervisorId) {
      const assignedIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(filters.supervisorId);
      staffList = staffList.filter((u) => assignedIds.includes(u.id) || u.id === filters.supervisorId);
    }

    if (staffList.length === 0) {
      return {
        rows: [],
        summary: {
          totalSubmissions: 0, avgPerDay: 0, totalTarget: 0,
          overallPercent: 0, completedCount: 0, behindCount: 0, inactiveCount: 0,
          supervisorlessLgaCount: 0,
        },
        totalItems: 0,
      };
    }

    // Separate staff by type
    const enumeratorClerkIds = staffList.filter((u) => u.role?.name !== 'supervisor').map((u) => u.id);
    const supervisorUsers = staffList.filter((u) => u.role?.name === 'supervisor');

    const boundaries = getWatBoundaries();

    // Live today counts for enumerators/clerks
    let liveCountMap = new Map<string, { todayCount: number; lastSubmittedAt: string | null }>();
    if (enumeratorClerkIds.length > 0) {
      const liveCounts = await db
        .select({
          submitterId: submissions.submitterId,
          todayCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${boundaries.todayStart})`,
          lastSubmittedAt: sql<string>`MAX(${submissions.submittedAt})`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, enumeratorClerkIds))
        .groupBy(submissions.submitterId);

      liveCountMap = new Map(
        liveCounts
          .filter((r): r is typeof r & { submitterId: string } => r.submitterId !== null)
          .map((r) => [
            r.submitterId,
            { todayCount: Number(r.todayCount), lastSubmittedAt: r.lastSubmittedAt },
          ]),
      );
    }

    // Snapshot aggregates for week/month (enumerators/clerks)
    const weekDateStr = getWatDateString(boundaries.weekStart);
    const monthDateStr = getWatDateString(boundaries.monthStart);

    const allStaffIds = staffList.map((u) => u.id);
    let snapshotMap = new Map<string, {
      weekCount: number; monthCount: number;
      weekApproved: number; weekRejected: number;
      monthApproved: number; monthRejected: number;
      daysActive: number;
    }>();
    if (allStaffIds.length > 0) {
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
          inArray(dailyProductivitySnapshots.userId, allStaffIds),
          gte(dailyProductivitySnapshots.date, monthDateStr),
        ))
        .groupBy(dailyProductivitySnapshots.userId);

      snapshotMap = new Map(
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
    }

    // Live fraud counts for enumerators/clerks
    let todayFraudMap = new Map<string, { approved: number; rejected: number }>();
    if (enumeratorClerkIds.length > 0) {
      const todayFraudCounts = await db
        .select({
          enumeratorId: fraudDetections.enumeratorId,
          approvedCount: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.severity} = 'clean' OR ${fraudDetections.resolution} IN ('false_positive', 'dismissed'))`,
          rejectedCount: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} = 'confirmed_fraud')`,
        })
        .from(fraudDetections)
        .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
        .where(and(
          inArray(fraudDetections.enumeratorId, enumeratorClerkIds),
          gte(submissions.submittedAt, boundaries.todayStart),
        ))
        .groupBy(fraudDetections.enumeratorId);

      todayFraudMap = new Map(
        todayFraudCounts.map((r) => [r.enumeratorId, {
          approved: Number(r.approvedCount) || 0,
          rejected: Number(r.rejectedCount) || 0,
        }]),
      );
    }

    // Supervisor review throughput: count fraud_detections reviewed by each supervisor
    const supervisorReviewMap = new Map<string, {
      todayReviews: number; weekReviews: number; monthReviews: number;
      approved: number; rejected: number;
    }>();
    if (supervisorUsers.length > 0) {
      const supervisorIds = supervisorUsers.map((u) => u.id);
      const reviewCounts = await db
        .select({
          reviewedBy: fraudDetections.reviewedBy,
          todayReviews: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.reviewedAt} >= ${boundaries.todayStart})`,
          weekReviews: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.reviewedAt} >= ${boundaries.weekStart})`,
          monthReviews: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.reviewedAt} >= ${boundaries.monthStart})`,
          approved: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} IN ('false_positive', 'dismissed'))`,
          rejected: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} = 'confirmed_fraud')`,
        })
        .from(fraudDetections)
        .where(and(
          inArray(fraudDetections.reviewedBy, supervisorIds),
          gte(fraudDetections.reviewedAt, boundaries.monthStart),
        ))
        .groupBy(fraudDetections.reviewedBy);

      for (const r of reviewCounts) {
        if (r.reviewedBy) {
          supervisorReviewMap.set(r.reviewedBy, {
            todayReviews: Number(r.todayReviews) || 0,
            weekReviews: Number(r.weekReviews) || 0,
            monthReviews: Number(r.monthReviews) || 0,
            approved: Number(r.approved) || 0,
            rejected: Number(r.rejected) || 0,
          });
        }
      }
    }

    // Previous period for trend calculation
    const prevWeekStart = new Date(boundaries.weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const prevWeekDateStr = getWatDateString(prevWeekStart);

    let prevSnapshotMap = new Map<string, { total: number; days: number }>();
    if (allStaffIds.length > 0) {
      const prevSnapshotAggs = await db
        .select({
          userId: dailyProductivitySnapshots.userId,
          prevWeekTotal: sql<number>`SUM(${dailyProductivitySnapshots.submissionCount})`,
          prevWeekDays: sql<number>`COUNT(DISTINCT ${dailyProductivitySnapshots.date})`,
        })
        .from(dailyProductivitySnapshots)
        .where(and(
          inArray(dailyProductivitySnapshots.userId, allStaffIds),
          gte(dailyProductivitySnapshots.date, prevWeekDateStr),
          lte(dailyProductivitySnapshots.date, weekDateStr),
        ))
        .groupBy(dailyProductivitySnapshots.userId);

      prevSnapshotMap = new Map(
        prevSnapshotAggs.map((r) => [r.userId, {
          total: Number(r.prevWeekTotal) || 0,
          days: Number(r.prevWeekDays) || 1,
        }]),
      );
    }

    // Build supervisor → team member count map for supervisor targets
    const supervisorTeamCounts = new Map<string, number>();
    for (const sup of supervisorUsers) {
      const memberIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(sup.id);
      supervisorTeamCounts.set(sup.id, memberIds.length);
    }

    // Build supervisor name lookup: enumeratorId → supervisorName
    const supervisorNameMap = new Map<string, string | null>();
    if (allStaffIds.length > 0) {
      const activeAssignments = await db
        .select({
          enumeratorId: teamAssignments.enumeratorId,
          supervisorId: teamAssignments.supervisorId,
        })
        .from(teamAssignments)
        .where(and(
          inArray(teamAssignments.enumeratorId, allStaffIds),
          isNull(teamAssignments.unassignedAt),
        ));

      // Get supervisor names
      const supIds = [...new Set(activeAssignments.map((a) => a.supervisorId))];
      if (supIds.length > 0) {
        const supNames = await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, supIds));
        const supNameLookup = new Map(supNames.map((s) => [s.id, s.fullName]));

        for (const a of activeAssignments) {
          supervisorNameMap.set(a.enumeratorId, supNameLookup.get(a.supervisorId) ?? null);
        }
      }
    }

    // LGA name lookup
    const lgaNameMap = new Map<string, string>();
    const lgaIds = [...new Set(staffList.filter((u) => u.lgaId).map((u) => u.lgaId!))];
    if (lgaIds.length > 0) {
      const lgaRecords = await db
        .select({ id: lgas.id, name: lgas.name })
        .from(lgas)
        .where(inArray(lgas.id, lgaIds));
      for (const l of lgaRecords) {
        lgaNameMap.set(l.id, l.name);
      }
    }

    // Working days
    const now = new Date();
    const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
    const dayOfWeek = watNow.getUTCDay();
    const workingDaysThisWeek = dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5);

    // Fetch targets once
    const activeTargets = await ProductivityTargetService.getActiveTargets();

    // Build rows
    let allRows: StaffProductivityRowExtended[] = [];

    for (const staff of staffList) {
      const isSupervisor = staff.role?.name === 'supervisor';
      const roleName = staff.role?.name as 'enumerator' | 'data_entry_clerk' | 'supervisor';

      let todayCount: number;
      let weekCount: number;
      let monthCount: number;
      let approvedCount: number;
      let rejectedCount: number;
      let lastActiveAt: string | null;
      let target: number;

      const lgaOverride = staff.lgaId
        ? activeTargets.lgaOverrides.find((o) => o.lgaId === staff.lgaId)
        : undefined;

      if (isSupervisor) {
        // Supervisor: count reviews, not submissions
        const reviews = supervisorReviewMap.get(staff.id);
        todayCount = reviews?.todayReviews ?? 0;
        weekCount = reviews?.weekReviews ?? 0;
        monthCount = reviews?.monthReviews ?? 0;
        approvedCount = reviews?.approved ?? 0;
        rejectedCount = reviews?.rejected ?? 0;
        lastActiveAt = staff.lastLoginAt?.toISOString() ?? null;

        // Target = sum of team members' targets
        const teamSize = supervisorTeamCounts.get(staff.id) ?? 0;
        const memberTarget = lgaOverride?.dailyTarget ?? activeTargets.defaultTarget;
        target = teamSize * memberTarget;
      } else {
        // Enumerator/Clerk: count submissions
        const live = liveCountMap.get(staff.id);
        const snap = snapshotMap.get(staff.id);
        const todayFraud = todayFraudMap.get(staff.id);

        target = lgaOverride?.dailyTarget ?? activeTargets.defaultTarget;
        todayCount = live?.todayCount ?? 0;
        weekCount = (snap?.weekCount ?? 0) + todayCount;
        monthCount = (snap?.monthCount ?? 0) + todayCount;

        if (filters.period === 'today') {
          approvedCount = todayFraud?.approved ?? 0;
          rejectedCount = todayFraud?.rejected ?? 0;
        } else if (filters.period === 'month' || filters.period === 'custom') {
          approvedCount = (todayFraud?.approved ?? 0) + (snap?.monthApproved ?? 0);
          rejectedCount = (todayFraud?.rejected ?? 0) + (snap?.monthRejected ?? 0);
        } else {
          approvedCount = (todayFraud?.approved ?? 0) + (snap?.weekApproved ?? 0);
          rejectedCount = (todayFraud?.rejected ?? 0) + (snap?.weekRejected ?? 0);
        }
        lastActiveAt = live?.lastSubmittedAt ?? staff.lastLoginAt?.toISOString() ?? null;
      }

      const totalForRejRate = approvedCount + rejectedCount;
      const rejRate = totalForRejRate > 0 ? Math.round((rejectedCount / totalForRejRate) * 100) : 0;

      const status = computeStatus(todayCount, target || 1, lastActiveAt);

      // Trend
      const snap = snapshotMap.get(staff.id);
      const prevSnap = prevSnapshotMap.get(staff.id);
      const currentWeekDays = Math.max(workingDaysThisWeek, 1);
      const currentWeekAvg = weekCount / currentWeekDays;
      const prevWeekAvg = prevSnap ? prevSnap.total / Math.max(prevSnap.days, 1) : 0;
      const trend = computeTrend(currentWeekAvg, prevWeekAvg);

      const daysActive = `${(snap?.daysActive ?? 0) + (todayCount > 0 ? 1 : 0)}/${workingDaysThisWeek}`;
      const percent = target > 0 ? Math.round((todayCount / target) * 100) : 0;

      const weekTarget = target * workingDaysThisWeek;
      const monthTarget = target * 22;

      allRows.push({
        id: staff.id,
        fullName: staff.fullName,
        role: roleName,
        lgaId: staff.lgaId ?? '',
        lgaName: staff.lgaId ? (lgaNameMap.get(staff.lgaId) ?? '') : '',
        supervisorName: isSupervisor ? null : (supervisorNameMap.get(staff.id) ?? null),
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

    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      allRows = allRows.filter((r) => r.status === filters.status);
    }
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      allRows = allRows.filter((r) =>
        r.fullName.toLowerCase().includes(searchLower) ||
        r.lgaName.toLowerCase().includes(searchLower),
      );
    }

    // Sort
    const sortBy = filters.sortBy ?? 'fullName';
    const sortOrder = filters.sortOrder ?? 'asc';
    allRows.sort((a, b) => {
      const aVal = a[sortBy as keyof StaffProductivityRowExtended];
      const bVal = b[sortBy as keyof StaffProductivityRowExtended];
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

    // Count supervisorless LGAs
    const lgaStaffGroups = new Map<string, { hasSupervisor: boolean }>();
    for (const row of allRows) {
      if (!row.lgaId) continue;
      const existing = lgaStaffGroups.get(row.lgaId);
      if (!existing) {
        lgaStaffGroups.set(row.lgaId, { hasSupervisor: row.role === 'supervisor' });
      } else if (row.role === 'supervisor') {
        existing.hasSupervisor = true;
      }
    }
    const supervisorlessLgaCount = [...lgaStaffGroups.values()].filter((g) => !g.hasSupervisor).length;

    // Summary (before pagination)
    const totalSubmissions = allRows.reduce((sum, r) => sum + r.todayCount, 0);
    const totalTarget = allRows.reduce((sum, r) => sum + r.target, 0);
    const summary = {
      totalSubmissions,
      avgPerDay: totalItems > 0 ? Math.round(totalSubmissions / totalItems) : 0,
      totalTarget,
      overallPercent: totalTarget > 0 ? Math.round((totalSubmissions / totalTarget) * 100) : 0,
      completedCount: allRows.filter((r) => r.status === 'complete').length,
      behindCount: allRows.filter((r) => r.status === 'behind').length,
      inactiveCount: allRows.filter((r) => r.status === 'inactive').length,
      supervisorlessLgaCount,
    };

    // Paginate
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const paginatedRows = allRows.slice(offset, offset + pageSize);

    return { rows: paginatedRows, summary, totalItems };
  }

  /**
   * Story 5.6b: Get LGA comparison data (Super Admin).
   * Returns per-LGA aggregated stats with staffing model inference.
   */
  static async getLgaComparison(
    filters: CrossLgaFilterParams,
  ): Promise<{ rows: LgaProductivityRow[]; summary: { totalLgas: number; totalSubmissions: number; overallPercent: number; supervisorlessCount: number } }> {
    // Get all LGAs
    const allLgas = await db.select({ id: lgas.id, name: lgas.name }).from(lgas);

    // Filter LGAs if specified
    let filteredLgas = allLgas;
    if (filters.lgaIds && filters.lgaIds.length > 0) {
      filteredLgas = allLgas.filter((l) => filters.lgaIds!.includes(l.id));
    }

    // Get all active staff with roles
    const allStaff = await db.query.users.findMany({
      where: inArray(users.status, ['active', 'verified']),
      with: { role: true },
      columns: { id: true, fullName: true, lgaId: true, roleId: true, status: true },
    });

    // Group staff by LGA
    const staffByLga = new Map<string, typeof allStaff>();
    for (const user of allStaff) {
      if (!user.lgaId) continue;
      const existing = staffByLga.get(user.lgaId) ?? [];
      existing.push(user);
      staffByLga.set(user.lgaId, existing);
    }

    const boundaries = getWatBoundaries();
    const weekDateStr = getWatDateString(boundaries.weekStart);
    const monthDateStr = getWatDateString(boundaries.monthStart);
    const activeTargets = await ProductivityTargetService.getActiveTargets();

    // Working days for trend
    const now = new Date();
    const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
    const dayOfWeek = watNow.getUTCDay();
    const workingDaysThisWeek = dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5);

    // Get live today counts for all enumerators/clerks grouped by their LGA
    const enumeratorClerkIds = allStaff
      .filter((u) => u.role?.name === 'enumerator' || u.role?.name === 'data_entry_clerk')
      .map((u) => u.id);

    let liveCountMap = new Map<string, number>();
    if (enumeratorClerkIds.length > 0) {
      const liveCounts = await db
        .select({
          submitterId: submissions.submitterId,
          todayCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${boundaries.todayStart})`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, enumeratorClerkIds))
        .groupBy(submissions.submitterId);

      liveCountMap = new Map(
        liveCounts
          .filter((r): r is typeof r & { submitterId: string } => r.submitterId !== null)
          .map((r) => [r.submitterId, Number(r.todayCount)]),
      );
    }

    // Previous week for trend
    const prevWeekStart = new Date(boundaries.weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const prevWeekDateStr = getWatDateString(prevWeekStart);

    // Get snapshot data per user for week aggregation
    let weekSnapshotMap = new Map<string, number>();
    if (enumeratorClerkIds.length > 0) {
      const weekSnaps = await db
        .select({
          userId: dailyProductivitySnapshots.userId,
          weekCount: sql<number>`SUM(${dailyProductivitySnapshots.submissionCount})`,
        })
        .from(dailyProductivitySnapshots)
        .where(and(
          inArray(dailyProductivitySnapshots.userId, enumeratorClerkIds),
          gte(dailyProductivitySnapshots.date, weekDateStr),
        ))
        .groupBy(dailyProductivitySnapshots.userId);

      weekSnapshotMap = new Map(weekSnaps.map((r) => [r.userId, Number(r.weekCount) || 0]));
    }

    // Previous week snapshot for trend
    let prevWeekSnapshotMap = new Map<string, number>();
    if (enumeratorClerkIds.length > 0) {
      const prevSnaps = await db
        .select({
          userId: dailyProductivitySnapshots.userId,
          total: sql<number>`SUM(${dailyProductivitySnapshots.submissionCount})`,
        })
        .from(dailyProductivitySnapshots)
        .where(and(
          inArray(dailyProductivitySnapshots.userId, enumeratorClerkIds),
          gte(dailyProductivitySnapshots.date, prevWeekDateStr),
          lte(dailyProductivitySnapshots.date, weekDateStr),
        ))
        .groupBy(dailyProductivitySnapshots.userId);

      prevWeekSnapshotMap = new Map(prevSnaps.map((r) => [r.userId, Number(r.total) || 0]));
    }

    // Fraud rejection data for rejection rate
    let rejectionMap = new Map<string, { approved: number; rejected: number }>();
    if (enumeratorClerkIds.length > 0) {
      const fraudCounts = await db
        .select({
          enumeratorId: fraudDetections.enumeratorId,
          approved: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.severity} = 'clean' OR ${fraudDetections.resolution} IN ('false_positive', 'dismissed'))`,
          rejected: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} = 'confirmed_fraud')`,
        })
        .from(fraudDetections)
        .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
        .where(and(
          inArray(fraudDetections.enumeratorId, enumeratorClerkIds),
          gte(submissions.submittedAt, boundaries.weekStart),
        ))
        .groupBy(fraudDetections.enumeratorId);

      rejectionMap = new Map(
        fraudCounts.map((r) => [r.enumeratorId, {
          approved: Number(r.approved) || 0,
          rejected: Number(r.rejected) || 0,
        }]),
      );
    }

    // Build supervisor name lookup per LGA
    const supervisorsByLga = new Map<string, string | null>();
    for (const user of allStaff) {
      if (user.role?.name === 'supervisor' && user.lgaId) {
        supervisorsByLga.set(user.lgaId, user.fullName);
      }
    }

    // Build LGA rows
    const lgaRows: LgaProductivityRow[] = [];

    for (const lga of filteredLgas) {
      const lgaStaff = staffByLga.get(lga.id) ?? [];
      const supervisors = lgaStaff.filter((u) => u.role?.name === 'supervisor');
      const fieldStaff = lgaStaff.filter((u) => u.role?.name === 'enumerator' || u.role?.name === 'data_entry_clerk');
      const hasSupervisor = supervisors.length > 0;

      // Staffing model inference
      const staffingModel = inferStaffingModel(supervisors.length, fieldStaff.length);

      // Apply staffing model filter
      if (filters.staffingModel && filters.staffingModel !== 'all') {
        const matchesFilter =
          (filters.staffingModel === 'full' && hasSupervisor && fieldStaff.length >= 3) ||
          (filters.staffingModel === 'lean' && hasSupervisor && fieldStaff.length < 3) ||
          (filters.staffingModel === 'no_supervisor' && !hasSupervisor);
        if (!matchesFilter) continue;
      }

      // Skip LGAs with no staff
      if (fieldStaff.length === 0 && supervisors.length === 0) continue;

      const enumeratorCount = fieldStaff.length;
      const supervisorName = supervisorsByLga.get(lga.id) ?? null;

      // Aggregate today's totals for this LGA
      let todayTotal = 0;
      let bestPerformer: { name: string; count: number } | null = null;
      let lowestPerformer: { name: string; count: number } | null = null;

      for (const staff of fieldStaff) {
        const todayCount = liveCountMap.get(staff.id) ?? 0;
        todayTotal += todayCount;

        if (!bestPerformer || todayCount > bestPerformer.count) {
          bestPerformer = { name: staff.fullName, count: todayCount };
        }
        if (!lowestPerformer || todayCount < lowestPerformer.count) {
          lowestPerformer = { name: staff.fullName, count: todayCount };
        }
      }

      // LGA target
      const lgaOverride = activeTargets.lgaOverrides.find((o) => o.lgaId === lga.id);
      const perPersonTarget = lgaOverride?.dailyTarget ?? activeTargets.defaultTarget;
      const lgaTarget = enumeratorCount * perPersonTarget;
      const percent = lgaTarget > 0 ? Math.round((todayTotal / lgaTarget) * 100) : 0;
      const avgPerEnumerator = enumeratorCount > 0 ? Math.round((todayTotal / enumeratorCount) * 10) / 10 : 0;

      // Rejection rate for LGA
      let lgaApproved = 0;
      let lgaRejected = 0;
      for (const staff of fieldStaff) {
        const fraud = rejectionMap.get(staff.id);
        if (fraud) {
          lgaApproved += fraud.approved;
          lgaRejected += fraud.rejected;
        }
      }
      const lgaRejTotal = lgaApproved + lgaRejected;
      const rejRate = lgaRejTotal > 0 ? Math.round((lgaRejected / lgaRejTotal) * 100) : 0;

      // Trend: current week vs previous week per-LGA
      let currentWeekTotal = 0;
      let prevWeekTotal = 0;
      for (const staff of fieldStaff) {
        currentWeekTotal += (weekSnapshotMap.get(staff.id) ?? 0) + (liveCountMap.get(staff.id) ?? 0);
        prevWeekTotal += prevWeekSnapshotMap.get(staff.id) ?? 0;
      }
      const currentWeekDays = Math.max(workingDaysThisWeek, 1);
      const currentWeekAvg = currentWeekTotal / currentWeekDays;
      const prevWeekAvg = prevWeekTotal / 5; // previous full week
      const trend = computeTrend(currentWeekAvg, prevWeekAvg);

      lgaRows.push({
        lgaId: lga.id,
        lgaName: lga.name,
        staffingModel,
        hasSupervisor,
        enumeratorCount,
        supervisorName: hasSupervisor ? supervisorName : null,
        todayTotal,
        lgaTarget,
        percent,
        avgPerEnumerator,
        bestPerformer: enumeratorCount > 0 ? bestPerformer : null,
        lowestPerformer: enumeratorCount > 0 ? lowestPerformer : null,
        rejRate,
        trend,
      });
    }

    // Sort
    const sortBy = filters.sortBy ?? 'lgaName';
    const sortOrder = filters.sortOrder ?? 'asc';
    lgaRows.sort((a, b) => {
      const aVal = a[sortBy as keyof LgaProductivityRow];
      const bVal = b[sortBy as keyof LgaProductivityRow];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal);
      const numB = Number(bVal);
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    // Summary
    const totalSubmissions = lgaRows.reduce((sum, r) => sum + r.todayTotal, 0);
    const totalTarget = lgaRows.reduce((sum, r) => sum + r.lgaTarget, 0);
    const summary = {
      totalLgas: lgaRows.length,
      totalSubmissions,
      overallPercent: totalTarget > 0 ? Math.round((totalSubmissions / totalTarget) * 100) : 0,
      supervisorlessCount: lgaRows.filter((r) => !r.hasSupervisor).length,
    };

    return { rows: lgaRows, summary };
  }

  /**
   * Story 5.6b: Get LGA aggregate summary (Government Official + Super Admin).
   * Returns aggregate-only data — no staff names, no best/lowest performer.
   */
  static async getLgaSummary(
    filters: { period?: string; dateFrom?: string; dateTo?: string; lgaId?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' },
  ): Promise<{ rows: LgaAggregateSummaryRow[]; summary: { totalLgas: number; totalActiveStaff: number; overallCompletionRate: number; totalSubmissionsToday: number } }> {
    // Get all LGAs
    let allLgas = await db.select({ id: lgas.id, name: lgas.name }).from(lgas);
    if (filters.lgaId) {
      allLgas = allLgas.filter((l) => l.id === filters.lgaId);
    }

    // Get all active field staff
    const allStaff = await db.query.users.findMany({
      where: inArray(users.status, ['active', 'verified']),
      with: { role: true },
      columns: { id: true, lgaId: true },
    });
    const fieldStaff = allStaff.filter(
      (u) => u.role?.name === 'enumerator' || u.role?.name === 'data_entry_clerk',
    );

    // Group by LGA
    const staffByLga = new Map<string, string[]>();
    for (const user of fieldStaff) {
      if (!user.lgaId) continue;
      const existing = staffByLga.get(user.lgaId) ?? [];
      existing.push(user.id);
      staffByLga.set(user.lgaId, existing);
    }

    const boundaries = getWatBoundaries();
    const weekDateStr = getWatDateString(boundaries.weekStart);
    const monthDateStr = getWatDateString(boundaries.monthStart);
    const activeTargets = await ProductivityTargetService.getActiveTargets();

    // Working days calculations
    const now = new Date();
    const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
    const dayOfWeek = watNow.getUTCDay();
    const workingDaysThisWeek = dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5);

    // Get all field staff IDs
    const allFieldIds = fieldStaff.map((u) => u.id);

    // Live today counts
    let liveCountMap = new Map<string, number>();
    if (allFieldIds.length > 0) {
      const liveCounts = await db
        .select({
          submitterId: submissions.submitterId,
          todayCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${boundaries.todayStart})`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, allFieldIds))
        .groupBy(submissions.submitterId);

      liveCountMap = new Map(
        liveCounts
          .filter((r): r is typeof r & { submitterId: string } => r.submitterId !== null)
          .map((r) => [r.submitterId, Number(r.todayCount)]),
      );
    }

    // Week and month snapshot data
    let weekMonthMap = new Map<string, { weekCount: number; monthCount: number }>();
    if (allFieldIds.length > 0) {
      const snaps = await db
        .select({
          userId: dailyProductivitySnapshots.userId,
          weekCount: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${weekDateStr} THEN ${dailyProductivitySnapshots.submissionCount} ELSE 0 END)`,
          monthCount: sql<number>`SUM(CASE WHEN ${dailyProductivitySnapshots.date} >= ${monthDateStr} THEN ${dailyProductivitySnapshots.submissionCount} ELSE 0 END)`,
        })
        .from(dailyProductivitySnapshots)
        .where(and(
          inArray(dailyProductivitySnapshots.userId, allFieldIds),
          gte(dailyProductivitySnapshots.date, monthDateStr),
        ))
        .groupBy(dailyProductivitySnapshots.userId);

      weekMonthMap = new Map(snaps.map((r) => [r.userId, {
        weekCount: Number(r.weekCount) || 0,
        monthCount: Number(r.monthCount) || 0,
      }]));
    }

    // Previous week for trend
    const prevWeekStart = new Date(boundaries.weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const prevWeekDateStr = getWatDateString(prevWeekStart);

    let prevWeekMap = new Map<string, number>();
    if (allFieldIds.length > 0) {
      const prevSnaps = await db
        .select({
          userId: dailyProductivitySnapshots.userId,
          total: sql<number>`SUM(${dailyProductivitySnapshots.submissionCount})`,
        })
        .from(dailyProductivitySnapshots)
        .where(and(
          inArray(dailyProductivitySnapshots.userId, allFieldIds),
          gte(dailyProductivitySnapshots.date, prevWeekDateStr),
          lte(dailyProductivitySnapshots.date, weekDateStr),
        ))
        .groupBy(dailyProductivitySnapshots.userId);

      prevWeekMap = new Map(prevSnaps.map((r) => [r.userId, Number(r.total) || 0]));
    }

    // Build LGA summary rows
    const lgaRows: LgaAggregateSummaryRow[] = [];

    for (const lga of allLgas) {
      const lgaFieldIds = staffByLga.get(lga.id) ?? [];
      const activeStaff = lgaFieldIds.length;

      if (activeStaff === 0) continue;

      let todayTotal = 0;
      let weekTotal = 0;
      let monthTotal = 0;
      let prevWeekTotal = 0;

      for (const id of lgaFieldIds) {
        todayTotal += liveCountMap.get(id) ?? 0;
        const snap = weekMonthMap.get(id);
        weekTotal += (snap?.weekCount ?? 0) + (liveCountMap.get(id) ?? 0);
        monthTotal += (snap?.monthCount ?? 0) + (liveCountMap.get(id) ?? 0);
        prevWeekTotal += prevWeekMap.get(id) ?? 0;
      }

      const lgaOverride = activeTargets.lgaOverrides.find((o) => o.lgaId === lga.id);
      const perPersonTarget = lgaOverride?.dailyTarget ?? activeTargets.defaultTarget;
      const dailyTarget = activeStaff * perPersonTarget;
      const percent = dailyTarget > 0 ? Math.round((todayTotal / dailyTarget) * 100) : 0;

      const daysInWeek = Math.max(workingDaysThisWeek, 1);
      const weekAvgPerDay = daysInWeek > 0 ? Math.round((weekTotal / daysInWeek) * 10) / 10 : 0;

      const monthTarget = activeStaff * perPersonTarget * 22;
      const completionRate = monthTarget > 0 ? Math.round((monthTotal / monthTarget) * 100) : 0;

      // Trend
      const currentWeekAvg = weekTotal / daysInWeek;
      const prevWeekAvg = prevWeekTotal / 5;
      const trend = computeTrend(currentWeekAvg, prevWeekAvg);

      lgaRows.push({
        lgaId: lga.id,
        lgaName: lga.name,
        activeStaff,
        todayTotal,
        dailyTarget,
        percent,
        weekTotal,
        weekAvgPerDay,
        monthTotal,
        completionRate,
        trend,
      });
    }

    // Sort
    const sortBy = filters.sortBy ?? 'lgaName';
    const sortOrder = filters.sortOrder ?? 'asc';
    lgaRows.sort((a, b) => {
      const aVal = a[sortBy as keyof LgaAggregateSummaryRow];
      const bVal = b[sortBy as keyof LgaAggregateSummaryRow];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal);
      const numB = Number(bVal);
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    // Summary
    const totalActiveStaff = lgaRows.reduce((sum, r) => sum + r.activeStaff, 0);
    const totalSubmissionsToday = lgaRows.reduce((sum, r) => sum + r.todayTotal, 0);
    const totalMonthSubmissions = lgaRows.reduce((sum, r) => sum + r.monthTotal, 0);
    const totalMonthTarget = lgaRows.reduce((sum, r) => sum + r.activeStaff, 0) * (activeTargets.defaultTarget) * 22;
    const overallCompletionRate = totalMonthTarget > 0 ? Math.round((totalMonthSubmissions / totalMonthTarget) * 100) : 0;

    return {
      rows: lgaRows,
      summary: {
        totalLgas: lgaRows.length,
        totalActiveStaff,
        overallCompletionRate,
        totalSubmissionsToday,
      },
    };
  }
}

/** Infer staffing model from supervisor/field staff counts */
function inferStaffingModel(supervisorCount: number, fieldStaffCount: number): string {
  if (supervisorCount === 0) return `No Supervisor (${fieldStaffCount})`;
  if (fieldStaffCount >= 3) return `Full (${supervisorCount}+${fieldStaffCount})`;
  return `Lean (${supervisorCount}+${fieldStaffCount})`;
}

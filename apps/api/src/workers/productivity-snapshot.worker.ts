/**
 * Productivity Snapshot Worker
 *
 * BullMQ worker that captures daily submission counts for all active
 * enumerators and data entry clerks. Runs nightly at 23:59 WAT.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 * Follows fraud-detection.worker.ts pattern.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { db } from '../db/index.js';
import { users, submissions, fraudDetections, dailyProductivitySnapshots } from '../db/schema/index.js';
import { sql, eq, and, gte, lt, inArray } from 'drizzle-orm';

const logger = pino({ name: 'productivity-snapshot-worker' });

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const WAT_OFFSET_MS = 1 * 60 * 60 * 1000;

/**
 * Get WAT day boundaries (midnight to midnight WAT in UTC).
 */
function getWatDayBoundaries(date?: Date): { start: Date; end: Date; dateStr: string } {
  const ref = date ?? new Date();
  const watNow = new Date(ref.getTime() + WAT_OFFSET_MS);

  const dayStart = new Date(watNow);
  dayStart.setUTCHours(0, 0, 0, 0);
  const start = new Date(dayStart.getTime() - WAT_OFFSET_MS);

  const dayEnd = new Date(watNow);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const end = new Date(dayEnd.getTime() - WAT_OFFSET_MS);

  const dateStr = watNow.toISOString().split('T')[0]; // YYYY-MM-DD

  return { start, end, dateStr };
}

async function processSnapshot(_job: Job): Promise<{ staffCount: number; duration: number }> {
  const startTime = Date.now();
  const { start, end, dateStr } = getWatDayBoundaries();

  logger.info({ event: 'productivity.snapshot.start', date: dateStr });

  // Get all active enumerators and data entry clerks
  const activeStaff = await db.query.users.findMany({
    where: inArray(users.status, ['active', 'verified']),
    with: { role: true },
    columns: { id: true, lgaId: true, roleId: true },
  });

  const eligibleStaff = activeStaff.filter(
    (u) => u.role?.name === 'enumerator' || u.role?.name === 'data_entry_clerk',
  );

  if (eligibleStaff.length === 0) {
    logger.info({ event: 'productivity.snapshot.no_staff', date: dateStr });
    return { staffCount: 0, duration: Date.now() - startTime };
  }

  const staffIds = eligibleStaff.map((u) => u.id);

  // Count submissions per staff for the WAT day
  const submissionCounts = await db
    .select({
      submitterId: submissions.submitterId,
      count: sql<number>`COUNT(*)`,
    })
    .from(submissions)
    .where(and(
      inArray(submissions.submitterId, staffIds),
      gte(submissions.submittedAt, start),
      lt(submissions.submittedAt, end),
    ))
    .groupBy(submissions.submitterId);

  const countMap = new Map(
    submissionCounts.map((r) => [r.submitterId, Number(r.count)]),
  );

  // Approved/rejected from fraud_detections for today's submissions
  const fraudCounts = await db
    .select({
      enumeratorId: fraudDetections.enumeratorId,
      approvedCount: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.severity} = 'clean' OR ${fraudDetections.resolution} IN ('false_positive', 'dismissed'))`,
      rejectedCount: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} = 'confirmed_fraud')`,
    })
    .from(fraudDetections)
    .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
    .where(and(
      inArray(fraudDetections.enumeratorId, staffIds),
      gte(submissions.submittedAt, start),
      lt(submissions.submittedAt, end),
    ))
    .groupBy(fraudDetections.enumeratorId);

  const fraudMap = new Map(
    fraudCounts.map((r) => [r.enumeratorId, {
      approved: Number(r.approvedCount) || 0,
      rejected: Number(r.rejectedCount) || 0,
    }]),
  );

  // Upsert snapshots for each staff member (idempotent)
  for (const staff of eligibleStaff) {
    const submissionCount = countMap.get(staff.id) ?? 0;
    const fraud = fraudMap.get(staff.id);

    await db
      .insert(dailyProductivitySnapshots)
      .values({
        userId: staff.id,
        lgaId: staff.lgaId,
        roleId: staff.roleId,
        date: dateStr,
        submissionCount,
        approvedCount: fraud?.approved ?? 0,
        rejectedCount: fraud?.rejected ?? 0,
      })
      .onConflictDoUpdate({
        target: [dailyProductivitySnapshots.userId, dailyProductivitySnapshots.date],
        set: {
          submissionCount,
          approvedCount: fraud?.approved ?? 0,
          rejectedCount: fraud?.rejected ?? 0,
        },
      });
  }

  const duration = Date.now() - startTime;

  logger.info({
    event: 'productivity.snapshot.complete',
    date: dateStr,
    staffCount: eligibleStaff.length,
    duration,
  });

  return { staffCount: eligibleStaff.length, duration };
}

// Only create worker if not in test mode (avoid Redis connection in tests)
let productivitySnapshotWorker: Worker | null = null;

if (!isTestMode()) {
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  productivitySnapshotWorker = new Worker(
    'productivity-snapshot',
    processSnapshot,
    { connection, concurrency: 1 },
  );

  productivitySnapshotWorker.on('completed', (job) => {
    logger.info({ event: 'productivity.snapshot.job_completed', jobId: job.id });
  });

  productivitySnapshotWorker.on('failed', (job, error) => {
    logger.error({ event: 'productivity.snapshot.job_failed', jobId: job?.id, error: error.message });
  });
}

export { productivitySnapshotWorker, processSnapshot };

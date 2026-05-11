/**
 * Story 9-12 AC#10 / Task 1.9 — Pending-NIN reminder worker.
 *
 * Daily sweep over pending-NIN respondents. For each row:
 *   - Determine elapsed time since the reminder epoch (max of created_at and
 *     metadata.reminder_state.deferred_at).
 *   - If > 30 days and not yet transitioned, flip status to nin_unavailable
 *     and audit-log PENDING_NIN_TRANSITIONED. Reminder cadence stops.
 *   - Otherwise, find the next un-sent milestone (T+2d / T+7d / T+14d) for
 *     which elapsed has crossed the threshold and dispatch a reminder via
 *     `resolveReminderDestination`. Mark milestone sent in metadata so the
 *     next tick doesn't send a duplicate.
 *
 * Email lookup: since `respondents` carries no email column, the worker
 * queries the most recent magic_link_tokens row (any purpose) for each
 * respondent_id. Public-source respondents always have one because the
 * wizard issues one on Step 5 submit. Enumerator/clerk-source rows have
 * no token by default → falls through to phone (SMS-flag-on enumerator
 * source) or supervisor-LGA task.
 *
 * Worker is created lazily inside `startReminderWorker()` so test mode
 * does not open a Redis connection at import time.
 */

import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { db } from '../db/index.js';
import { respondents } from '../db/schema/respondents.js';
import { magicLinkTokens } from '../db/schema/magic-link-tokens.js';
import type { Respondent } from '../db/schema/respondents.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { MagicLinkService } from '../services/magic-link.service.js';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
import {
  resolveReminderDestination,
  type ReminderDestination,
  type ReminderInput,
} from '../services/pending-nin.service.js';
import { getSetting } from '../lib/settings.js';
import pino from 'pino';

const logger = pino({ name: 'reminder-worker' });

const QUEUE_NAME = 'pending-nin-reminders';

const TRANSITION_DAYS = 30;
type Milestone = 2 | 7 | 14;
const MILESTONES: Milestone[] = [2, 7, 14];

/**
 * Shape of `respondents.metadata.reminder_state` (NEW for Story 9-12).
 * Keys are milestone-day numbers as strings; values are ISO timestamps when
 * each reminder was sent. `deferred_at` resets the reminder epoch.
 */
interface ReminderState {
  deferred_at?: string;
  sent_2d?: string;
  sent_7d?: string;
  sent_14d?: string;
  transitioned_at?: string;
  last_destination?: ReminderDestination;
  /** Whether the most recent dispatch actually delivered (code review M1). */
  last_dispatched?: boolean;
  /** One-token reason / outcome from the most recent dispatch. */
  last_dispatch_reason?: string;
}

/** Convert milestone-day to the metadata key. */
function milestoneKey(d: Milestone): keyof ReminderState {
  return (`sent_${d}d`) as keyof ReminderState;
}

function reminderEpoch(row: Respondent): Date {
  const meta = (row.metadata as { reminder_state?: ReminderState } | null) ?? {};
  const deferred = meta.reminder_state?.deferred_at;
  if (deferred) return new Date(deferred);
  return row.createdAt;
}

function daysSince(epoch: Date): number {
  return (Date.now() - epoch.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Look up the most recent magic-link email for this respondent. Any purpose
 * counts — wizard_resume / pending_nin_complete / login all carry the same
 * email by construction (the wizard owns the email natural key).
 */
async function lookupRespondentEmail(respondentId: string): Promise<string | null> {
  const row = await db.query.magicLinkTokens.findFirst({
    where: eq(magicLinkTokens.respondentId, respondentId),
    columns: { email: true },
    orderBy: [desc(magicLinkTokens.createdAt)],
  });
  return row?.email ?? null;
}

/**
 * Result shape from every dispatch path. `dispatched=true` means a real
 * artefact left the building (email actually sent); `dispatched=false` is
 * recorded against the milestone so callers can tell from `reminder_state`
 * which reminders never actually went out (code review M1, 2026-05-11).
 */
interface DispatchResult {
  dispatched: boolean;
  reason: string;
}

/**
 * Build the email body for a pending-NIN reminder. Issues a fresh
 * `pending_nin_complete` magic link so each reminder carries a working URL —
 * older links expire on a 72h TTL while reminders fire over a 30-day window.
 */
async function dispatchEmailReminder(respondent: Respondent, email: string, milestone: Milestone): Promise<DispatchResult> {
  // Issue a fresh link for this milestone so the user always has a working URL.
  const issued = await MagicLinkService.issueToken({
    email,
    purpose: 'pending_nin_complete',
    respondentId: respondent.id,
  });
  await MagicLinkService.sendMagicLinkEmail({
    email,
    tokenPlaintext: issued.tokenPlaintext,
    purpose: 'pending_nin_complete',
    expiresAt: issued.expiresAt,
  });

  AuditService.logAction({
    actorId: null,
    action: AUDIT_ACTIONS.MAGIC_LINK_ISSUED,
    targetResource: 'magic_link_tokens',
    targetId: issued.id,
    details: {
      email,
      purpose: 'pending_nin_complete',
      trigger: 'reminder_worker',
      milestone: `${milestone}d`,
      respondentId: respondent.id,
    },
  });

  logger.info({
    event: 'reminder_worker.email_sent',
    respondentId: respondent.id,
    email,
    milestone: `${milestone}d`,
  });
  return { dispatched: true, reason: 'email_sent' };
}

/**
 * Placeholder SMS dispatch. The Story 9-12 SMS path is feature-flagged off by
 * default (Task 2 ships only the no-op provider); when the operator flips
 * `auth.sms_otp_enabled` ON, the wired-up provider takes over. This function
 * exists so the worker can record the *intent* — actual delivery happens once
 * a real adapter is configured.
 *
 * Code review M1 (2026-05-11) — returns `dispatched: false` so the milestone
 * metadata accurately records that nothing went out. The milestone is STILL
 * marked sent (to avoid a daily retry storm), but `reminder_state.last_destination`
 * carries `reason: 'sms_no_real_provider_configured'` so an operator querying
 * `reminder_state.sent_*` rows can identify the gap.
 */
async function dispatchSmsReminder(respondent: Respondent, phone: string, milestone: Milestone): Promise<DispatchResult> {
  logger.warn({
    event: 'reminder_worker.sms_dispatch_no_provider',
    respondentId: respondent.id,
    phone,
    milestone: `${milestone}d`,
  });
  return { dispatched: false, reason: 'sms_no_real_provider_configured' };
}

async function dispatchSupervisorTask(respondent: Respondent, lgaId: string, milestone: Milestone): Promise<DispatchResult> {
  // Supervisor-task surface is currently a logged record only. The Story 9-11
  // audit-log viewer + future Story 4-x supervisor-task queue will surface
  // these for action; for now the audit-log entry is the authoritative
  // record that the reminder cycle was attempted-but-deflected.
  logger.info({
    event: 'reminder_worker.supervisor_task_queued',
    respondentId: respondent.id,
    lgaId,
    milestone: `${milestone}d`,
  });
  return { dispatched: false, reason: 'supervisor_task_surface_not_yet_wired' };
}

async function transitionToNinUnavailable(respondent: Respondent): Promise<void> {
  const meta = (respondent.metadata as { reminder_state?: ReminderState } | null) ?? {};
  const reminderState: ReminderState = {
    ...(meta.reminder_state ?? {}),
    transitioned_at: new Date().toISOString(),
  };
  const newMeta = {
    ...meta,
    reminder_state: reminderState as unknown as Record<string, unknown>,
  };

  await db
    .update(respondents)
    .set({ status: 'nin_unavailable', metadata: newMeta, updatedAt: new Date() })
    .where(and(eq(respondents.id, respondent.id), eq(respondents.status, 'pending_nin_capture')));

  AuditService.logAction({
    actorId: null,
    action: AUDIT_ACTIONS.PENDING_NIN_TRANSITIONED,
    targetResource: 'respondent',
    targetId: respondent.id,
    details: { trigger: 'reminder_worker_30d_window', source: respondent.source },
  });

  logger.info({
    event: 'reminder_worker.transitioned',
    respondentId: respondent.id,
    source: respondent.source,
  });
}

async function markMilestoneSent(
  respondent: Respondent,
  milestone: Milestone,
  destination: ReminderDestination,
  dispatchResult: DispatchResult,
): Promise<void> {
  const meta = (respondent.metadata as { reminder_state?: ReminderState } | null) ?? {};
  // Code review M1 (2026-05-11) — annotate the destination with whether a
  // real artefact actually went out. Audit chain consumers can filter for
  // `last_dispatch_reason` !== 'email_sent' to find pending-NIN reminders
  // that were silently swallowed by placeholder dispatchers.
  const reminderState: ReminderState = {
    ...(meta.reminder_state ?? {}),
    [milestoneKey(milestone)]: new Date().toISOString(),
    last_destination: destination,
    last_dispatched: dispatchResult.dispatched,
    last_dispatch_reason: dispatchResult.reason,
  };
  const newMeta = {
    ...meta,
    reminder_state: reminderState as unknown as Record<string, unknown>,
  };
  await db
    .update(respondents)
    .set({ metadata: newMeta, updatedAt: new Date() })
    .where(eq(respondents.id, respondent.id));
}

interface SweepStats {
  scanned: number;
  transitioned: number;
  remindersSent: number;
  skipped: number;
}

/**
 * Run one daily sweep. Exported for tests.
 */
export async function runReminderSweep(): Promise<SweepStats> {
  const stats: SweepStats = { scanned: 0, transitioned: 0, remindersSent: 0, skipped: 0 };

  const pending = await db.query.respondents.findMany({
    where: and(eq(respondents.status, 'pending_nin_capture'), isNull(respondents.nin)),
  });
  stats.scanned = pending.length;

  if (pending.length === 0) {
    return stats;
  }

  // Read SMS flag once per sweep (cached at lib/settings.ts).
  const smsEnabled = (await getSetting<boolean>('auth.sms_otp_enabled')) === true;

  for (const row of pending) {
    try {
      const elapsed = daysSince(reminderEpoch(row));
      const meta = (row.metadata as { reminder_state?: ReminderState } | null) ?? {};
      const state = meta.reminder_state ?? {};

      // 30-day transition is terminal — short-circuits any remaining
      // reminders and stops the cadence.
      if (elapsed >= TRANSITION_DAYS && !state.transitioned_at) {
        await transitionToNinUnavailable(row);
        stats.transitioned++;
        continue;
      }

      // Find the highest milestone whose threshold has been crossed but
      // whose reminder has not yet been sent. Iterate descending so we
      // skip earlier milestones if a deferral pushed the user past them.
      const dueMilestone: Milestone | null = (() => {
        for (let i = MILESTONES.length - 1; i >= 0; i--) {
          const m = MILESTONES[i];
          if (elapsed >= m && !state[milestoneKey(m)]) return m;
        }
        return null;
      })();

      if (dueMilestone === null) {
        stats.skipped++;
        continue;
      }

      const email = await lookupRespondentEmail(row.id);
      const input: ReminderInput = {
        source: row.source,
        email,
        phoneNumber: row.phoneNumber,
        lgaId: row.lgaId,
        smsEnabled,
      };
      const destination = resolveReminderDestination(input);

      let result: DispatchResult;
      switch (destination.type) {
        case 'email':
          result = await dispatchEmailReminder(row, destination.target as string, dueMilestone);
          break;
        case 'sms':
          result = await dispatchSmsReminder(row, destination.target as string, dueMilestone);
          break;
        case 'supervisor_task':
          result = await dispatchSupervisorTask(row, destination.target as string, dueMilestone);
          break;
        case 'skip':
          result = { dispatched: false, reason: destination.reason };
          break;
      }

      // Code review M1 (2026-05-11) — always mark the milestone consumed so
      // the worker doesn't retry the same row daily. The metadata captures
      // whether the dispatch actually delivered (`last_dispatched`) so
      // operators can identify silent gaps in the SMS / supervisor-task
      // surfaces from the `reminder_state` column directly.
      await markMilestoneSent(row, dueMilestone, destination, result);
      if (result.dispatched) {
        stats.remindersSent++;
      } else {
        stats.skipped++;
      }
    } catch (err) {
      // Per-row failure must not abort the whole sweep — log and move on.
      logger.error({
        event: 'reminder_worker.row_failed',
        respondentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ event: 'reminder_worker.sweep_complete', ...stats });
  return stats;
}

let workerInstance: Worker | null = null;

export function startReminderWorker(): Worker {
  if (workerInstance) return workerInstance;
  const connection = createRedisConnection();
  workerInstance = new Worker(
    QUEUE_NAME,
    async () => {
      return runReminderSweep();
    },
    { connection, concurrency: 1 },
  );

  workerInstance.on('failed', (job, err) => {
    logger.error({
      event: 'reminder_worker.job_failed',
      jobId: job?.id,
      error: err.message,
    });
  });

  return workerInstance;
}

export async function closeReminderWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}

// Side-effect at module load matches the existing worker convention (email,
// import, etc.). Test mode skips to avoid opening a Redis connection.
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
export const reminderWorker = isTestMode() ? null : startReminderWorker();
// Code review M5 (2026-05-11) — `EmailService` import was kept only to
// reserve the symbol for future direct-send paths; removed since unused.
// Reminder emails go through `MagicLinkService.sendMagicLinkEmail`.

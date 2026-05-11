/**
 * Story 9-12 — Pending-NIN service.
 *
 * Two responsibilities:
 *   1. `resolveReminderDestination` — pure function returning the channel +
 *      target for a single pending-NIN reminder, per the 5-branch precedence
 *      table in Story 9-12 Dev Notes "Universal pending-NIN — Option 1 design,
 *      D2 Reminder destination precedence".
 *   2. `getEnumeratorPendingNinAggregates` — Task 3.7 anti-abuse data surface.
 *      Per-enumerator 7-day rolling counters for supervisor visibility. The
 *      UI soft-warning affordance is deliberately deferred to post-field-survey
 *      per D6 — this story only ships the data surface.
 *
 * The reminder resolver is intentionally a pure / synchronous function:
 *   - Caller (the BullMQ reminder worker) fans out the side-effects (email send,
 *     SMS send, supervisor task enqueue) based on the returned intent.
 *   - The function takes ALL the inputs it needs as a single object so it can
 *     be tested without spinning up a DB. SMS feature flag, looked-up email,
 *     phone, lga, source — every dependency is explicit.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { RespondentSource } from '../db/schema/respondents.js';

export interface ReminderInput {
  /** Where the respondent originated. Drives the precedence ladder. */
  source: RespondentSource;
  /**
   * Caller-resolved email address (e.g. via the most recent
   * `magic_link_tokens` row keyed by respondent_id). Null when unknown.
   */
  email: string | null;
  /** Canonical E.164 phone (post prep-input-sanitisation normalise) or null. */
  phoneNumber: string | null;
  /** Respondent's LGA — used to enqueue a supervisor-LGA task when fallback. */
  lgaId: string | null;
  /**
   * Whether SMS reminders are enabled at the system level. Read once per
   * worker tick via `getSetting<boolean>('auth.sms_otp_enabled')`. When false
   * the resolver never returns `type: 'sms'` even if a phone is available.
   */
  smsEnabled: boolean;
}

export type ReminderChannel = 'email' | 'sms' | 'supervisor_task' | 'skip';

export interface ReminderDestination {
  /** The dispatch channel the worker should use. */
  type: ReminderChannel;
  /**
   * Channel-specific target. `email` → address; `sms` → phone; `supervisor_task` → lgaId; `skip` → null.
   */
  target: string | null;
  /** One-token reason for telemetry / structured logs. */
  reason: string;
}

/**
 * Story 9-12 Task 3.6 — Reminder destination resolver.
 *
 * Pure function — given a respondent's source + collected fields + the SMS
 * feature flag state, return the channel and target the worker should use.
 *
 * Precedence (matches Dev Notes D2):
 *
 *   public            → email                                  → (else skip; should be impossible)
 *   enumerator        → email → sms-when-flag-on → supervisor → (else supervisor_task)
 *   clerk             → email → supervisor                    → (else supervisor_task)
 *   imported_*        → skip (historical imports never get reminders)
 */
export function resolveReminderDestination(input: ReminderInput): ReminderDestination {
  const { source, email, phoneNumber, lgaId, smsEnabled } = input;

  if (source === 'imported_itf_supa' || source === 'imported_other') {
    return { type: 'skip', target: null, reason: 'imported_source_no_reminders' };
  }

  if (email) {
    return { type: 'email', target: email, reason: 'primary_email' };
  }

  if (source === 'enumerator' && smsEnabled && phoneNumber) {
    return { type: 'sms', target: phoneNumber, reason: 'enumerator_sms_fallback' };
  }

  if ((source === 'enumerator' || source === 'clerk') && lgaId) {
    return { type: 'supervisor_task', target: lgaId, reason: `${source}_supervisor_fallback` };
  }

  // No email / no usable fallback. Worker still needs to advance the schedule;
  // returning skip lets it record the reminder as deferred-with-no-channel.
  return { type: 'skip', target: null, reason: 'no_channel_available' };
}

/**
 * Story 9-12 Task 3.7 — Anti-abuse data surface.
 *
 * Per-enumerator rolling 7-day pending-NIN aggregate. UI affordance (soft
 * warning) is deferred per D6; this query exists so the supervisor dashboard
 * can render the metric and so we can observe real distributions before
 * deciding on a threshold.
 *
 * Returns one row per enumerator who has any submission in the window.
 * Implementation note: respondents.submitter_id is TEXT (legacy from Story 3.4)
 * so the join is intentionally text=text against users.id (cast on the user
 * side). The CTE shape mirrors the Story 5-6a productivity rollup pattern.
 */
export interface EnumeratorPendingAggregate {
  enumeratorId: string;
  enumeratorEmail: string | null;
  totalSubmissions: number;
  pendingNinSubmissions: number;
  /**
   * Code review MR-14 (2026-05-11) — was `pendingNinUnresolvedAt7d`. Renamed
   * to be threshold-agnostic since `unresolvedThresholdDays` is now an
   * option on the query. Caller decides what "unresolved" means.
   */
  pendingNinUnresolvedCount: number;
  deferReasonProvidedCount: number;
}

export async function getEnumeratorPendingNinAggregates(options?: {
  windowDays?: number;
  unresolvedThresholdDays?: number;
}): Promise<EnumeratorPendingAggregate[]> {
  const windowDays = options?.windowDays ?? 7;
  // Code review L2 (2026-05-11) — the "unresolved" cut-off was hard-coded to
  // 7 days regardless of windowDays. Parameterise so callers can adjust both
  // dials independently. Defaults preserve the original semantics.
  const unresolvedThresholdDays = options?.unresolvedThresholdDays ?? 7;

  const result = await db.execute(sql`
    WITH window_respondents AS (
      SELECT
        r.id,
        r.submitter_id,
        r.status,
        r.created_at,
        r.metadata
      FROM respondents r
      WHERE r.source = 'enumerator'
        AND r.submitter_id IS NOT NULL
        AND r.created_at >= now() - (${windowDays}::int || ' days')::interval
    ),
    grouped AS (
      SELECT
        wr.submitter_id AS enumerator_id,
        COUNT(*)::int AS total_submissions,
        COUNT(*) FILTER (WHERE wr.status = 'pending_nin_capture')::int AS pending_nin_submissions,
        COUNT(*) FILTER (
          WHERE wr.status = 'pending_nin_capture'
            AND wr.created_at < now() - (${unresolvedThresholdDays}::int || ' days')::interval
        )::int AS pending_nin_unresolved_count,
        COUNT(*) FILTER (
          WHERE wr.status = 'pending_nin_capture'
            AND wr.metadata ? 'defer_reason_nin'
        )::int AS defer_reason_provided_count
      FROM window_respondents wr
      GROUP BY wr.submitter_id
    )
    SELECT
      g.enumerator_id::text AS enumerator_id,
      u.email AS enumerator_email,
      g.total_submissions,
      g.pending_nin_submissions,
      g.pending_nin_unresolved_count,
      g.defer_reason_provided_count
    FROM grouped g
    LEFT JOIN users u ON u.id::text = g.enumerator_id
    ORDER BY g.pending_nin_unresolved_count DESC, g.pending_nin_submissions DESC
  `);

  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  return rows.map((r) => ({
    enumeratorId: String(r.enumerator_id),
    enumeratorEmail: r.enumerator_email ? String(r.enumerator_email) : null,
    totalSubmissions: Number(r.total_submissions),
    pendingNinSubmissions: Number(r.pending_nin_submissions),
    pendingNinUnresolvedCount: Number(r.pending_nin_unresolved_count),
    deferReasonProvidedCount: Number(r.defer_reason_provided_count),
  }));
}

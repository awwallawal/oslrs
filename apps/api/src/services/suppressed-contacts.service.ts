/**
 * Story 13-51 (AC1) — THE PEOPLE WE HAVE GONE SILENT ON.
 *
 * `email_suppressions` changes system behaviour and reports to nobody: a bounce costs a contact
 * channel permanently and silently, and nothing anywhere surfaces "we have stopped writing to this
 * person" to an operator. That is [[pattern-monitor-measuring-something-else]] in its purest form —
 * a monitor that acts and never speaks. This read model is the speaking half.
 *
 * ⛔ IT JOINS THROUGH ALL THREE CONTACT SOURCES, NOT `submissions` ALONE (AC1.5).
 * `respondent-contact.service.ts` is the canonical resolver and fixes the priority
 * (`submissions.raw_data->>'email'` → `magic_link_tokens.email` → `users.email`) precisely because
 * **not every respondent has a submissions row**; its own measurement records **45 respondents
 * reachable ONLY via `magic_link_tokens`**. A suppression list joined on submissions alone omits
 * exactly the people who are hardest to reach — which is the population this screen exists for.
 * Confirmed against SCP §10.10: `aladechristianahtosin@gmail.co` and `ogunbonadamola@gmail.co`
 * have drafts/token footprints and **no `users` row at all**.
 *
 * ⚠️ A SUPPRESSED ADDRESS IS NOT "THIS PERSON IS UNREACHABLE" (AC1.7). Five of the eleven live
 * suppressions have a HEALTHY TWIN already in the register. Showing the suppressed address without
 * the twin invites an operator to "correct" somebody who can already be reached — so the twin is
 * part of the row, not a detail behind a click.
 *
 * No schema change was needed for any of this (AC1.6): `email_suppressions` already carried
 * `email`, `reason`, `sourceMessageId` and `suppressedAt`, and everything else here is a join.
 * (The `severity` / `bounceCount` columns are AC3.4's, not AC1's.)
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  classifySuppressedAddress,
  suggestCorrectionFor,
  type SuppressedAddressBucket,
} from '../lib/classify-suppressed-address.js';
import {
  SOFT_BOUNCE_RETRY_AFTER_HOURS,
  classifyEmailState,
  type EmailContactState,
} from '../lib/bounce-severity.js';

export interface SuppressedContactRow {
  email: string;
  reason: string;
  severity: 'hard' | 'soft' | null;
  bounceCount: number;
  suppressedAt: Date;
  /** Which KIND of broken this is — the three buckets of AC1.2/AC1.4. */
  bucket: SuppressedAddressBucket;
  /** Offered only for `capture_typo`, and only ever as a suggestion. */
  suggestedCorrection: string | null;
  respondentId: string | null;
  referenceCode: string | null;
  name: string | null;
  /** AC1.3 — for anyone unreachable by email this is the actual next step. */
  phoneNumber: string | null;
  status: string | null;
  /** AC1.1 — a suppressed `pending_nin_capture` person is the urgent case: the system is actively
   *  pretending to contact them, and the ladder will retire them as though they had declined. */
  midLadder: boolean;
  /** AC1.7 — another address for the SAME person that is NOT suppressed. */
  healthyTwin: string | null;
  /**
   * Where this address stands — `holding` | `given_up` | `opted_out`. Decided by the ONE owner of
   * the rule (`classifyEmailState`), never re-derived here or in JSX.
   *
   * ⚠️ `opted_out` replaced a boolean that lumped unsubscribes in with dead mailboxes and sent an
   * operator to the phone (code-review M1).
   */
  emailState: EmailContactState;
  /** Only for `holding`: when the automatic retry becomes eligible. */
  retryEligibleAt: Date | null;
}

export async function listSuppressedContacts(): Promise<SuppressedContactRow[]> {
  const result = (await db.execute(sql`
    WITH contact AS (
      -- Every (respondent, address) pair the register knows, from all three sources. This is the
      -- same triple the canonical resolver reads; narrowing it to submissions is the defect
      -- AC1.5 exists to prevent.
      SELECT sub.respondent_id, lower(btrim(sub.raw_data->>'email')) AS email
        FROM submissions sub
       WHERE btrim(coalesce(sub.raw_data->>'email', '')) <> ''
      UNION
      SELECT m.respondent_id, lower(btrim(m.email))
        FROM magic_link_tokens m
       WHERE m.respondent_id IS NOT NULL AND btrim(coalesce(m.email, '')) <> ''
      UNION
      SELECT r.id, lower(btrim(u.email))
        FROM users u
        JOIN respondents r ON r.user_id = u.id
       WHERE btrim(coalesce(u.email, '')) <> ''
    )
    SELECT
      s.email,
      s.reason,
      s.severity,
      s.bounce_count,
      s.suppressed_at,
      r.id           AS respondent_id,
      r.reference_code,
      btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')) AS name,
      r.phone_number,
      r.status,
      twin.email     AS healthy_twin
    FROM email_suppressions s
    LEFT JOIN LATERAL (
      SELECT rr.*
        FROM contact c
        JOIN respondents rr ON rr.id = c.respondent_id
       WHERE c.email = s.email
         AND rr.status <> 'rolled_back'
       ORDER BY rr.created_at
       LIMIT 1
    ) r ON TRUE
    -- AC1.7 — a DIFFERENT address for the same person that is not itself suppressed.
    LEFT JOIN LATERAL (
      SELECT c2.email
        FROM contact c2
       WHERE c2.respondent_id = r.id
         AND c2.email <> s.email
         AND NOT EXISTS (SELECT 1 FROM email_suppressions s2 WHERE s2.email = c2.email)
       LIMIT 1
    ) twin ON TRUE
    ORDER BY
      -- The urgent case first: mid-ladder people the system is still pretending to contact.
      (r.status = 'pending_nin_capture') DESC,
      s.suppressed_at DESC
  `)) as unknown as {
    rows: Array<{
      email: string;
      reason: string;
      severity: 'hard' | 'soft' | null;
      bounce_count: number;
      suppressed_at: Date;
      respondent_id: string | null;
      reference_code: string | null;
      name: string | null;
      phone_number: string | null;
      status: string | null;
      healthy_twin: string | null;
    }>;
  };

  return result.rows.map((r) => {
    const suppressedAt = new Date(r.suppressed_at);
    const bounceCount = Number(r.bounce_count ?? 1);
    const emailState = classifyEmailState({ reason: r.reason, severity: r.severity, bounceCount });
    return {
      email: r.email,
      reason: r.reason,
      severity: r.severity,
      bounceCount,
      suppressedAt,
      bucket: classifySuppressedAddress(r.email),
      suggestedCorrection: suggestCorrectionFor(r.email),
      respondentId: r.respondent_id,
      referenceCode: r.reference_code,
      name: r.name && r.name.length > 0 ? r.name : null,
      phoneNumber: r.phone_number,
      status: r.status,
      midLadder: r.status === 'pending_nin_capture',
      healthyTwin: r.healthy_twin,
      emailState,
      retryEligibleAt:
        emailState === 'holding'
          ? new Date(suppressedAt.getTime() + SOFT_BOUNCE_RETRY_AFTER_HOURS * 3600_000)
          : null,
    };
  });
}

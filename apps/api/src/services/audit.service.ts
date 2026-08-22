/**
 * Audit Service — Immutable Append-Only Audit Logging with Hash Chain
 *
 * Provides two modes for audit logging:
 * - Fire-and-forget (logPiiAccess): for list views and non-critical logging
 * - Transactional (logPiiAccessTx): for use within db.transaction()
 *
 * Story 6-1 additions:
 * - SHA-256 hash chain for tamper detection
 * - Append-only enforcement via DB trigger (see drizzle/0007_audit_logs_immutable.sql)
 * - Expanded AUDIT_ACTIONS covering PII, data, auth, admin, and system events
 * - Hash chain verification endpoint
 *
 * Note: PostgreSQL superusers CAN bypass the append-only trigger — this is acceptable
 * for emergency DB maintenance, and such access is logged by PostgreSQL's own mechanisms.
 *
 * Created in prep-2 (Lightweight Audit Logging for PII Access).
 * Enhanced in Story 6-1 (Immutable Append-Only Audit Logs).
 */

import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/audit.js';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import type { AuthenticatedRequest } from '../types.js';

const logger = pino({ name: 'audit-service' });

/** Genesis hash — seed for the hash chain (Story 6-1, AC5) */
export const GENESIS_HASH = createHash('sha256').update('OSLRS-AUDIT-GENESIS-2026').digest('hex');

/**
 * Chain-wide advisory lock key. EVERY audit writer takes this before reading the tail.
 *
 * WHY `SELECT … FOR UPDATE` ON THE TAIL WAS NEVER ENOUGH (fixed 2026-08-03, 13-49 R12).
 * The four writers below already carried the comment "Lock the most recent record to serialize
 * concurrent hash chain inserts". The intent was right; the mechanism does not deliver it. Under
 * READ COMMITTED, `SELECT … ORDER BY created_at DESC LIMIT 1 FOR UPDATE` locks the row it FOUND.
 * A second writer runs the same query, blocks on that row, and when the first COMMITS the second
 * re-checks *that same row* — still present, still unchanged, so it is returned. The first
 * writer's newly INSERTED row was never in the second's scan, because an INSERT is not an UPDATE
 * of the row being locked. Both writers therefore compute the SAME `previous_hash` and the chain
 * FORKS. Row-level locking cannot serialise "read the end of a table, then append to it"; only a
 * lock on the CHAIN itself can.
 *
 * Measured cost on prod before the fix: 117 forks in 1,706 rows, first on 2026-04-04, which made
 * `verifyHashChain()` report INVALID continuously. No tampering — 0 self-hash failures — but a
 * control that reports INVALID in normal operation is a control nobody reads.
 *
 * ⚠️ This stops NEW forks. The 117 historical ones are permanent and MUST stay: repairing them
 * means recomputing stored hashes, which is precisely what the chain exists to make impossible.
 * Verify with `pnpm --filter @oslsr/api audit:verify-chain` — the tamper signal is
 * `SELF-HASH failures`, which must be 0; forks are an ordering property of the writer.
 *
 * Contention is a non-issue at this volume (~1.7k rows since April) and the lock is
 * transaction-scoped, so it releases on COMMIT/ROLLBACK without any explicit unlock.
 */
export const AUDIT_CHAIN_LOCK = 8151642026;

/** Comprehensive audit action types (Story 6-1, AC7) */
export const AUDIT_ACTIONS = {
  // PII Access (existing — backward compatible)
  PII_VIEW_RECORD: 'pii.view_record',
  PII_VIEW_LIST: 'pii.view_list',
  PII_EXPORT_CSV: 'pii.export_csv',
  PII_EXPORT_PDF: 'pii.export_pdf',
  PII_SEARCH: 'pii.search',
  PII_VIEW_PRODUCTIVITY: 'pii.view_productivity',
  PII_EXPORT_PRODUCTIVITY: 'pii.export_productivity',
  PII_VIEW_SUBMISSION_RESPONSE: 'pii.view_submission_response',
  PII_CONTACT_REVEAL: 'pii.contact_reveal',
  // Data Modification
  DATA_CREATE: 'data.create',
  DATA_UPDATE: 'data.update',
  DATA_DELETE: 'data.delete',
  // Authentication
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGE: 'auth.password_change',
  AUTH_TOKEN_REFRESH: 'auth.token_refresh',
  // MFA (Story 9-13)
  MFA_ENROLLED: 'mfa.enrolled',
  MFA_VERIFY_SUCCESS: 'mfa.verify_success',
  MFA_VERIFY_FAILURE: 'mfa.verify_failure',
  MFA_BACKUP_USED: 'mfa.backup_used',
  MFA_DISABLED: 'mfa.disabled',
  MFA_REGENERATED: 'mfa.regenerated',
  MFA_LOCKOUT: 'mfa.lockout',
  MFA_GRACE_EXPIRED_REDIRECT: 'mfa.grace_expired_redirect',
  // Secondary-data import batches (Story 11-2)
  IMPORT_BATCH_CREATED: 'import_batch.created',
  IMPORT_BATCH_ROLLED_BACK: 'import_batch.rolled_back',
  // Admin Actions
  ADMIN_USER_DEACTIVATE: 'admin.user_deactivate',
  ADMIN_USER_REACTIVATE: 'admin.user_reactivate',
  ADMIN_ROLE_CHANGE: 'admin.role_change',
  ADMIN_CONFIG_UPDATE: 'admin.config_update',
  // System Events
  SYSTEM_BACKUP: 'system.backup',
  SYSTEM_RESTORE: 'system.restore',
  SYSTEM_MIGRATION: 'system.migration',
  // Data Hygiene (prep-input-sanitisation-layer)
  RESPONDENT_BACKFILLED_NORMALISATION: 'respondent.backfilled_normalisation',
  // Audit Log Viewer (Story 9-11)
  AUDIT_LOG_EXPORTED: 'audit_log.exported',
  // Feature flag flips (prep-settings-landing-and-feature-flags)
  SETTINGS_FLIPPED: 'settings.flipped',
  // Public registration / magic-link (Story 9-12)
  MAGIC_LINK_ISSUED: 'magic_link.issued',
  MAGIC_LINK_REDEEMED: 'magic_link.redeemed',
  PENDING_NIN_DEFERRED: 'pending_nin.deferred_again',
  PENDING_NIN_TRANSITIONED: 'pending_nin.transitioned_to_nin_unavailable',
  // Universal pending-NIN — Option 1 (Story 9-12 Task 3.8)
  // Fired regardless of source (public / enumerator / clerk) on any pending-NIN row creation
  // and on its later promotion via race-resolution merge or magic-link complete-nin endpoint.
  PENDING_NIN_CREATED: 'pending_nin.created',
  PENDING_NIN_PROMOTED: 'pending_nin.promoted',
  // Operator re-engagement campaigns (Story 9-27)
  // Per-send audit trail for outbound nudges to abandoned wizard-draft cohorts.
  // Email is Part A; SMS + WhatsApp keys added when Parts B/C ship.
  OPERATOR_REENGAGEMENT_EMAIL_SENT: 'operator.reengagement_email_sent',
  // Operator Cohort A supplemental-survey campaign (Story 9-28 Path B)
  // Per-send audit trail for outbound supplemental-questionnaire invitations
  // to already-completed wizard respondents whose Step 4 data was missing.
  OPERATOR_SUPPLEMENTAL_SURVEY_SENT: 'operator.supplemental_survey_sent',
  // Operator Cohort C thank-you + referral campaign (Story 13-11)
  // Per-send audit trail for outbound thank-you emails to completed end-to-end
  // registrants, inviting them to share the public registration link.
  OPERATOR_THANKYOU_REFERRAL_SENT: 'operator.thankyou_referral_sent',
  // Operations Dashboard Telegram digest (Story 9-19 Part C)
  // Per-send audit trail for the twice-daily ops digest pushed to the operator.
  OPS_DIGEST_SENT: 'ops.digest_sent',
  // Unified ingestion pipeline backfill + recovery (Story 9-26 Parts B + J)
  // Per-row forensic trail for the one-shot operator scripts that (B) stamp
  // the metadata.questionnaire_data_lost marker on the 43 pre-fix wizard
  // respondents and (J) email the 70 abandoned-but-data-rich wizard drafts a
  // resume magic-link. Per-row/per-send audit keeps the operator action out of
  // the silent-forensic-gap class the 2026-05-13 incident exposed.
  OPERATOR_BACKFILL_DATA_LOSS_MARKER: 'operator.backfill_data_loss_marker',
  OPERATOR_RECOVERY_EMAIL_SENT: 'operator.recovery_email_sent',
  // Story 9-18 Part F (AC#F5) — per-row forensic trail for the operator-gated
  // name-canonicalization backfill (swaps first_name/last_name on existing
  // surname-first respondent rows after the given/family split).
  OPERATOR_RESPONDENT_NAME_CANONICALIZED: 'operator.respondent_name_canonicalized',
  /**
   * 13-4 (2026-08-06) — an operator corrected a MISTYPED contact email and lifted the bounce
   * suppression it caused. Distinct from RESPONDENT_SELF_UPDATED: the respondent did not ask for
   * this and cannot be reached to confirm it, which is exactly why it must be traceable.
   *
   * The correction itself is small; the reason for the action key is not. A bounced address
   * silently costs a citizen their place in the pending-NIN ladder — the reminders keep sending
   * into a void and the ladder eventually retires them as if they had declined. Editing that
   * record is a real intervention in someone's registration, so it leaves a row.
   */
  OPERATOR_RESPONDENT_EMAIL_CORRECTED: 'operator.respondent_email_corrected',
  // Story 9-55 — NDPA evidentiary record of a captured parent/guardian consent
  // for an under-15 (minor) registrant, with the ILO Art.6 apprenticeship
  // attestation. Written via the hash-chain log within the submit transaction
  // (wizard path) or fire-and-forget on the async enumerator/clerk path.
  MINOR_GUARDIAN_CONSENT_CAPTURED: 'minor.guardian_consent_captured',
  // Story 9-58 (Deliverable B) — per-row forensic trail for the operator-gated
  // reference-code backfill (assigns OSL-YYYY-XXXXXX codes to pre-9-58
  // respondents that have none).
  OPERATOR_REFERENCE_CODE_BACKFILLED: 'operator.reference_code_backfilled',
  // Story 13-16 (AC2) — per-row forensic trail for the operator-gated LGA
  // canonicalization backfill (converts UUID-shaped respondents.lga_id values,
  // the pre-13-16 public-wizard vocabulary, to the canonical lgas.code slug).
  OPERATOR_LGA_ID_CANONICALIZED: 'operator.lga_id_canonicalized',
  // Story 9-58 (Deliverable A) — public registration-status check request.
  // Records the identifier CLASS (email / phone / reference-code) + whether a
  // status notification was dispatched — NEVER the raw PII identifier value
  // (AC8: logs must not become a PII enumeration side-channel).
  REGISTRATION_STATUS_REQUESTED: 'registration_status.requested',
  // Story 9-40 — a public user edited their own registration from the
  // dashboard (currently the marketplace-consent flag). Self-service edit via
  // the authenticated `PUT /me/registration`; actor IS the subject.
  RESPONDENT_SELF_UPDATED: 'respondent.self_updated',
  // Story 9-61 — a public user edited their full registration in-session
  // (identity / LGA / consent / questionnaire answers) via the authenticated
  // `PUT /me/registration/wizard`, OR completed their pending NIN in-session via
  // `POST /me/registration/complete-nin`. Distinct from RESPONDENT_SELF_UPDATED
  // (the lightweight 9-40 consent toggle) so the broader-edit trail is queryable
  // on its own. Actor IS the subject.
  RESPONDENT_SELF_EDITED: 'respondent.self_edited',
  RESPONDENT_SELF_NIN_COMPLETED: 'respondent.self_nin_completed',
  /** Two records for one person collapsed into one (duplicate merge, 2026-08). */
  RESPONDENT_MERGED: 'respondent.merged',
  /*
   * Story 13-59 (AC7.2) — a staff member actually TOOK their artefacts.
   *
   * ⚠️ These two are not decoration. The 2026-08-10 ruling replaced a pushed
   * email attachment (which lands whether or not the person acts) with a
   * closeable in-app modal, and AC7 is what buys back the property that was
   * lost: guaranteed possession. Without a record of the download, "we offered
   * it" is indistinguishable from "they have it" —
   * [[pattern-ship-a-fix-that-never-fires]] in its purest form.
   *
   * No schema change: the audit chain already carries exactly this shape, and
   * the dotted vocabulary already has the `user.activated` / `invitation.resend`
   * precedent.
   */
  STAFF_ID_CARD_DOWNLOADED: 'staff.id_card_downloaded',
  STAFF_BRIEFING_DOWNLOADED: 'staff.briefing_downloaded',
  /*
   * Story 13-51 (AC2.6) — CLOSING A LIVE VOCABULARY DRIFT, not minting new words.
   *
   * `_ops-contact-remediation.ts` has been writing these two as RAW STRING
   * LITERALS since 2026-08-11 (four rows on prod: §11 of the portfolio-triage
   * SCP). They compiled because `logAction`/`logActionTx` type `action` as a
   * bare `string`, so nothing forced them through this object.
   *
   * ⚠️ THE VALUES BELOW ARE DELIBERATELY THE STRINGS ALREADY ON PROD. `action`
   * IS part of the hash-chain payload (`computeHash`: id|action|actorId|
   * createdAt|details|previousHash), so re-spelling either one would leave the
   * historic rows unreachable by any query written against the new spelling and
   * un-rehashable by construction. The constant adopts the data; the data is
   * not migrated to the constant.
   */
  EMAIL_SUPPRESSION_LIFTED: 'email.suppression_lifted',
  USER_EMAIL_CORRECTED: 'user.email_corrected',
  /*
   * Story 13-51 (code-review L2) — NORMALISING A KEY IS NOT LIFTING A SUPPRESSION.
   *
   * `--normalise-keys` rewrites non-bare `email_suppressions.email` values (and deletes wrapped
   * duplicates whose bare form is already suppressed). It lifts nothing: the person stays
   * suppressed, the key merely becomes one a lookup can match. Filing it under
   * EMAIL_SUPPRESSION_LIFTED would have put a row that suppresses HARDER into the same bucket as
   * the rows that release someone — and `action` IS in the hash payload, so it would have been
   * unfixable the moment it was written to prod.
   *
   * Unlike the two above, this value has never been written by anything, so it is free to be
   * spelled correctly.
   */
  EMAIL_SUPPRESSION_KEYS_NORMALISED: 'email.suppression_keys_normalised',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Canonical `targetResource` values for audit-log entries (Story 9-33 F1).
 *
 * Extracted as constants to make the verifier-vs-emit-site coupling explicit:
 * a future rename of any value here causes a compile error at every reference
 * site (both producers and consumers), rather than silently drifting between
 * 'respondent' (current dominant pattern) and 'respondents' (one outlier at
 * backfill-input-sanitisation.ts). The smoke-test verifier at
 * `apps/api/scripts/_enumerator-path-smoke-test.ts` and the production
 * emission sites in `submission-processing.service.ts` both reference this
 * constant — drift between them was the false-negative class that the
 * Story 9-33 hotfix originally hid.
 */
export const AUDIT_TARGETS = {
  RESPONDENT: 'respondent',
  /*
   * Story 13-51 (AC2.6) — SINGULAR is canonical ([[feedback_audit_target_unification]],
   * and `RESPONDENT` above is the precedent).
   *
   * ⚠️ SCOPE, STATED SO IT IS NOT MISTAKEN FOR A FINISHED UNIFICATION: a census
   * on 2026-08-19 found `targetResource: 'users'` (plural) at **28 sites** —
   * mfa.controller.ts x12, staff.service.ts x7, auth.service.ts x4,
   * _ops-contact-remediation.ts x2, and one each in staff-artefacts.service.ts,
   * mfa-grace.ts and _deactivate-undeliverable-admins.ts. 13-51 re-points ONLY
   * the two it owns (the contact-remediation pair). The other 26 keep writing
   * 'users' and are a stated residual, NOT silently fixed here: flipping live
   * MFA/auth/staff audit values is a different blast radius and a different
   * story.
   *
   * ⛔ THE PROD ROW MIGRATION WAS ATTEMPTED AND IS IMPOSSIBLE BY DESIGN — and
   * that is the guarantee working, not an obstacle. `audit_logs` is append-only:
   * `trg_audit_logs_immutable` blocks UPDATE **and** DELETE. Proven by execution
   * on prod 2026-08-22, not predicted — `_ops-migrate-audit-target-users-to-user.ts
   * --apply` failed with `P0001` raised from `audit_logs_immutable()` line 3 and
   * the transaction rolled back, leaving all 4 rows untouched at 'users'.
   *
   * ⚠️ THE SCRIPT'S DRY-RUN COULD NEVER HAVE CAUGHT THAT. It printed a confident
   * "PREDICTION: 4 row(s) will change" because it read the input and never
   * attempted the write. A preview that does not exercise the operation is a
   * restatement of the input, not a preview.
   *
   * ➜ RETIRED ON AWWAL'S RULING 2026-08-22; the script is deleted. And the
   * project had already decided this: the audit-target convention says migration
   * is a bare constant swap at each SITE with **no data backfill**, and that any
   * plural-outlier site with live rows carries an inline cutover comment instead
   * — so a future NDPA forensic auditor can resolve "why does the audit chain
   * carry both spellings?" without spelunking git history. This block is that
   * comment.
   *
   * SO THE HISTORICAL RECORD STANDS, DELIBERATELY: 4 rows
   * (`email.suppression_lifted` x3, `user.email_corrected` x1) are spelled
   * 'users' because that is what the code wrote when it wrote them. Rewriting
   * them to look tidy is exactly what immutability exists to prevent. The drift
   * belongs to the WRITERS (26 live sites, stated residual above) and to any
   * READER grouping on `targetResource`, which should normalise on read.
   *
   * (`targetResource` is NOT in the hash payload, so none of this could have
   * invalidated the chain either way — verified against `computeHash` above.)
   */
  USER: 'user',
} as const;

export type AuditTarget = (typeof AUDIT_TARGETS)[keyof typeof AUDIT_TARGETS];

/**
 * Backward-compatible PII_ACTIONS alias (Task 5.2).
 * Existing 9 consumer call sites continue using PII_ACTIONS unchanged.
 */
export const PII_ACTIONS = {
  VIEW_RECORD: AUDIT_ACTIONS.PII_VIEW_RECORD,
  VIEW_LIST: AUDIT_ACTIONS.PII_VIEW_LIST,
  EXPORT_CSV: AUDIT_ACTIONS.PII_EXPORT_CSV,
  EXPORT_PDF: AUDIT_ACTIONS.PII_EXPORT_PDF,
  SEARCH_PII: AUDIT_ACTIONS.PII_SEARCH,
  VIEW_PRODUCTIVITY: AUDIT_ACTIONS.PII_VIEW_PRODUCTIVITY,
  EXPORT_PRODUCTIVITY: AUDIT_ACTIONS.PII_EXPORT_PRODUCTIVITY,
  VIEW_SUBMISSION_RESPONSE: AUDIT_ACTIONS.PII_VIEW_SUBMISSION_RESPONSE,
  CONTACT_REVEAL: AUDIT_ACTIONS.PII_CONTACT_REVEAL,
} as const;

export type PiiAction = (typeof PII_ACTIONS)[keyof typeof PII_ACTIONS];

/**
 * Canonical JSON stringification for hash consistency across JSONB round-trips.
 * PostgreSQL JSONB may reorder object keys; this ensures deterministic output
 * by sorting keys at every nesting level.
 */
function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) return '{}';
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}

/** Transaction type inferred from Drizzle db.transaction callback */
type DbTransaction = Parameters<Parameters<typeof db['transaction']>[0]>[0];

export interface HashChainVerificationResult {
  valid: boolean;
  totalRecords: number;
  verified: number;
  firstTampered?: { id: string; createdAt: Date };
}

export class AuditService {
  /**
   * Compute SHA-256 hash for a single audit record (Task 3.1).
   * Formula: SHA256(id | action | actorId | createdAt | canonicalJSON(details) | previousHash)
   */
  static computeHash(
    id: string,
    action: string,
    actorId: string | null,
    createdAt: Date,
    details: unknown,
    previousHash: string,
  ): string {
    const payload = `${id}|${action}|${actorId ?? 'SYSTEM'}|${createdAt.toISOString()}|${canonicalJsonStringify(details)}|${previousHash}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Fire-and-forget PII access logging with hash chain.
   * Does NOT await — failures are logged as warnings but never throw.
   * Signature unchanged from original for backward compatibility (Task 6.1).
   */
  static logPiiAccess(
    req: AuthenticatedRequest,
    action: PiiAction,
    targetResource: string,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): void {
    const id = uuidv7();
    const mergedDetails = {
      ...details,
      actorRole: req.user.role,
    };
    const createdAt = new Date();

    // Wrap in transaction for hash chain serialization (Task 3.4)
    db.transaction(async (tx) => {
      // Serialise on a CHAIN-WIDE lock, not on the tail row — see AUDIT_CHAIN_LOCK.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);
      const prevResult = await tx.execute(
        sql`SELECT hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      );
      const previousHash = (prevResult.rows[0] as Record<string, string>)?.hash ?? GENESIS_HASH;
      const hash = AuditService.computeHash(id, action, req.user.sub, createdAt, mergedDetails, previousHash);

      await tx.insert(auditLogs).values({
        id,
        actorId: req.user.sub,
        action,
        targetResource,
        targetId,
        details: mergedDetails,
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        hash,
        previousHash,
        createdAt,
      });
    }).catch((err) =>
      logger.warn({ err, event: 'audit.pii_log_failed', action, targetResource }, 'Failed to write PII audit log'),
    );
  }

  /**
   * Transactional PII access logging with hash chain.
   * Awaits the insert — use within db.transaction() for critical operations.
   * Signature unchanged from original for backward compatibility (Task 6.2).
   */
  static async logPiiAccessTx(
    tx: DbTransaction,
    actorId: string,
    action: PiiAction,
    targetResource: string,
    targetId: string | null,
    details?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
    actorRole?: string,
  ): Promise<void> {
    const id = uuidv7();
    const mergedDetails = actorRole
      ? { ...(details ?? {}), actorRole }
      : (details ?? null);
    const createdAt = new Date();

    // Serialise on a CHAIN-WIDE lock, not on the tail row — see AUDIT_CHAIN_LOCK.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);
    const prevResult = await tx.execute(
      sql`SELECT hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
    );
    const previousHash = (prevResult.rows[0] as Record<string, string>)?.hash ?? GENESIS_HASH;
    const hash = AuditService.computeHash(id, action, actorId, createdAt, mergedDetails, previousHash);

    await tx.insert(auditLogs).values({
      id,
      actorId,
      action,
      targetResource,
      targetId,
      details: mergedDetails,
      ipAddress: ipAddress ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
      hash,
      previousHash,
      createdAt,
    });
  }

  /**
   * Generic fire-and-forget audit log with hash chain.
   * Use for non-critical logging outside transactions. Never throws.
   */
  static logAction(params: {
    actorId: string | null;
    action: string;
    targetResource: string;
    targetId: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    const id = uuidv7();
    const createdAt = new Date();

    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);
      const prevResult = await tx.execute(
        sql`SELECT hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      );
      const previousHash = (prevResult.rows[0] as Record<string, string>)?.hash ?? GENESIS_HASH;
      const hash = AuditService.computeHash(id, params.action, params.actorId, createdAt, params.details ?? null, previousHash);

      await tx.insert(auditLogs).values({
        id,
        actorId: params.actorId,
        action: params.action,
        targetResource: params.targetResource,
        targetId: params.targetId,
        details: params.details ?? null,
        ipAddress: params.ipAddress ?? 'unknown',
        userAgent: params.userAgent ?? 'unknown',
        hash,
        previousHash,
        createdAt,
      });
    }).catch((err) =>
      logger.warn({ err, event: 'audit.log_action_failed', action: params.action }, 'Failed to write audit log'),
    );
  }

  /**
   * Generic transactional audit log with hash chain.
   * Use within db.transaction() for critical operations. Throws on error.
   */
  static async logActionTx(
    tx: DbTransaction,
    params: {
      actorId: string | null;
      action: string;
      targetResource: string;
      targetId: string | null;
      details?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    const id = uuidv7();
    const createdAt = new Date();

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);
    const prevResult = await tx.execute(
      sql`SELECT hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
    );
    const previousHash = (prevResult.rows[0] as Record<string, string>)?.hash ?? GENESIS_HASH;
    const hash = AuditService.computeHash(id, params.action, params.actorId, createdAt, params.details ?? null, previousHash);

    await tx.insert(auditLogs).values({
      id,
      actorId: params.actorId,
      action: params.action,
      targetResource: params.targetResource,
      targetId: params.targetId,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? 'unknown',
      userAgent: params.userAgent ?? 'unknown',
      hash,
      previousHash,
      createdAt,
    });
  }

  /**
   * Classify WHY the chain reports invalid — tampering, or merely ordering.
   *
   * `verifyHashChain` enforces two different invariants and collapses them into one boolean,
   * which is the right shape for a gate and the wrong shape for a human. The two mean opposite
   * things:
   *
   *   SELF-HASH  hash === computeHash(id, action, actor, createdAt, details, stored previous_hash)
   *              Ordering-INDEPENDENT. A failure means the ROW does not match its own hash: it was
   *              altered after write, or something bypassed AuditService (seed scripts, raw SQL).
   *              **This is the tamper signal.**
   *
   *   LINK       previous_hash === the preceding row's hash under ORDER BY created_at, id
   *              Ordering-DEPENDENT, and that order is not guaranteed. `createdAt` is stamped in
   *              JS before the transaction opens, and before AUDIT_CHAIN_LOCK existed two writers
   *              could read the same tail and store the same previous_hash — forking the chain
   *              with nothing tampered.
   *
   * Prod on 2026-08-03: INVALID, but **0 self-hash failures, 117 forks, 0 gaps**, first fork
   * 2026-04-04. Nothing was altered; the linear order simply never existed. Those 117 are
   * PERMANENT — repairing them means recomputing stored hashes, which is exactly what the chain
   * exists to make impossible — so this endpoint will keep reporting `valid: false` forever, and
   * without this breakdown that reads as "the audit log is compromised".
   *
   * A fork (previous_hash matches SOME row's hash) is concurrency; a gap (matches nothing) means a
   * predecessor is missing. Reporting all three as one word is how a concurrency artefact gets
   * escalated as tampering — or worse, how real tampering gets waved away as "that known thing".
   */
  static async classifyChainFailure(): Promise<{
    selfHashFailures: number;
    linkForks: number;
    linkGaps: number;
    firstSelfHashFailure: { id: string; createdAt: string } | null;
    interpretation: string;
  }> {
    const rows = (
      await db.execute(sql`
        SELECT id, action, actor_id, created_at, details, hash, previous_hash
          FROM audit_logs ORDER BY created_at ASC, id ASC
      `)
    ).rows as unknown as Array<{
      id: string; action: string; actor_id: string | null; created_at: string;
      details: unknown; hash: string; previous_hash: string | null;
    }>;

    const allHashes = new Set(rows.map((r) => r.hash));
    let selfHashFailures = 0, linkForks = 0, linkGaps = 0;
    let firstSelfHashFailure: { id: string; createdAt: string } | null = null;
    let prevHash: string | null = null;

    for (const r of rows) {
      const expected = AuditService.computeHash(
        r.id, r.action, r.actor_id, new Date(r.created_at), r.details, r.previous_hash ?? GENESIS_HASH,
      );
      if (r.hash !== expected) {
        selfHashFailures++;
        firstSelfHashFailure ??= { id: r.id, createdAt: r.created_at };
      }
      if (prevHash !== null && r.previous_hash !== prevHash) {
        if (r.previous_hash !== null && allHashes.has(r.previous_hash)) linkForks++;
        else linkGaps++;
      }
      prevHash = r.hash;
    }

    const interpretation =
      selfHashFailures > 0
        ? `TAMPER SIGNAL: ${selfHashFailures} row(s) do not match their own hash. Investigate the writer; do NOT recompute hashes to "repair" it.`
        : linkForks > 0 || linkGaps > 0
          ? `No tampering: every row matches its own hash. ${linkForks} fork(s) and ${linkGaps} gap(s) are ordering artefacts of concurrent writers, not evidence of alteration.`
          : 'Chain is fully consistent.';

    return { selfHashFailures, linkForks, linkGaps, firstSelfHashFailure, interpretation };
  }

  /**
   * Verify the integrity of the audit log hash chain (Task 4.1).
   * Walks records in chronological order, recomputes each hash, and compares
   * against stored values. Detects any tampered or modified records.
   *
   * @param options.limit - Spot-check mode: verify only the last N records (default: all)
   */
  static async verifyHashChain(options?: { limit?: number }): Promise<HashChainVerificationResult> {
    const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM audit_logs`);
    const totalRecords = parseInt((countResult.rows[0] as Record<string, string>).cnt, 10);

    if (totalRecords === 0) {
      return { valid: true, totalRecords: 0, verified: 0 };
    }

    const limit = options?.limit;

    // Fetch records in chronological order
    const records = await db.execute(
      limit
        ? sql`
            WITH numbered AS (
              SELECT id, action, actor_id, created_at, details, hash, previous_hash,
                     ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) as rn
              FROM audit_logs
            )
            SELECT id, action, actor_id, created_at, details, hash, previous_hash
            FROM numbered WHERE rn <= ${limit}
            ORDER BY created_at ASC, id ASC
          `
        : sql`
            SELECT id, action, actor_id, created_at, details, hash, previous_hash
            FROM audit_logs
            ORDER BY created_at ASC, id ASC
          `,
    );

    let verified = 0;
    let lastHash: string | null = null;

    for (const row of records.rows) {
      const r = row as Record<string, unknown>;
      const createdAt = new Date(r.created_at as string);

      // Verify hash computation: stored hash should match recomputed hash
      const hashInput = (r.previous_hash as string | null) ?? GENESIS_HASH;
      const expectedHash = AuditService.computeHash(
        r.id as string,
        r.action as string,
        r.actor_id as string | null,
        createdAt,
        r.details,
        hashInput,
      );

      if (r.hash !== expectedHash) {
        return { valid: false, totalRecords, verified, firstTampered: { id: r.id as string, createdAt } };
      }

      // Verify chain link: previous_hash should match the actual previous record's hash
      // Skip for first record in spot-check mode (predecessor not loaded)
      if (lastHash !== null && r.previous_hash !== lastHash) {
        return { valid: false, totalRecords, verified, firstTampered: { id: r.id as string, createdAt } };
      }

      lastHash = r.hash as string;
      verified++;
    }

    return { valid: true, totalRecords, verified };
  }

  /**
   * Get total audit log count (used by controller for performance guard).
   */
  static async getRecordCount(): Promise<number> {
    const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM audit_logs`);
    return parseInt((result.rows[0] as Record<string, string>).cnt, 10);
  }
}

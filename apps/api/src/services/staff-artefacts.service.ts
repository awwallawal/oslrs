/**
 * Story 13-59 (AC5, AC6, AC7) — the two artefacts a staff member is entitled to
 * hold, and the record of whether they actually took them.
 *
 * ## Why this module exists at all
 *
 * The 2026-08-10 ruling removed the email attachments to protect the sending
 * domain, and traded a PUSHED artefact (lands whether or not the person acts)
 * for a PULLED one. AC4.2 names exactly what the attachment was buying —
 * **offline access**, an enumerator standing in an LGA office with no data —
 * and AC7.1 names the failure mode of the replacement: *a closeable modal that
 * everyone dismisses has delivered nothing.*
 *
 * So the entitlement rules and the download record live HERE, on the server,
 * in one place:
 *
 * - the modal asks the server "does this person still owe themselves an
 *   artefact?" instead of re-deriving role rules in the client;
 * - the ProfilePage section asks the same question of the same endpoint;
 * - the operator's staff list asks it in bulk.
 *
 * Three doors, one implementation. 13-55's lesson was five hand-written copies
 * of one operation, and 13-54's negative control had to be re-pointed from the
 * primitive to the wrapper or it would have guarded a function production no
 * longer called.
 */
import { and, eq, inArray, max } from 'drizzle-orm';
import pino from 'pino';
import {
  type ArtefactKind,
  isBriefingRole,
  isIdCardRole,
} from '@oslsr/types';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/index.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { isBriefingAvailable } from './field-briefing.service.js';

const logger = pino({ name: 'staff-artefacts' });

export type { ArtefactKind };

const ACTION_BY_KIND: Record<ArtefactKind, string> = {
  id_card: AUDIT_ACTIONS.STAFF_ID_CARD_DOWNLOADED,
  briefing: AUDIT_ACTIONS.STAFF_BRIEFING_DOWNLOADED,
};

/**
 * ⚠️ The entitlement lists USED to be declared here, and the review counted
 * four copies of them by the time the story shipped (H3). They now live in
 * `@oslsr/types` (`staff-artefacts.ts`), imported by this service, by the
 * operator's SQL filter and by the browser column alike. Re-declaring them here
 * would recreate exactly the drift this module's own docblock warns about, so:
 * import, never re-list.
 */
const DOWNLOAD_ACTIONS = [
  AUDIT_ACTIONS.STAFF_ID_CARD_DOWNLOADED,
  AUDIT_ACTIONS.STAFF_BRIEFING_DOWNLOADED,
];

export interface ArtefactState {
  /** Does this artefact apply to this person's role at all? */
  applicable: boolean;
  /** Can it be served right now? */
  available: boolean;
  /** Why not, when not — drives the modal's copy rather than a broken download. */
  unavailableReason: 'photo_missing' | 'briefing_source_missing' | null;
  /** ISO timestamp of the MOST RECENT download, or null if never taken. */
  downloadedAt: string | null;
}

export interface StaffArtefactState {
  idCard: ArtefactState;
  briefing: ArtefactState;
  /**
   * AC7.4 — the modal re-appears while either applicable artefact is
   * undownloaded, and stops once they are taken. Computed here so "still
   * outstanding" means the same thing on every surface.
   *
   * ⚠️ An artefact that is applicable but UNAVAILABLE (no photo) does not keep
   * this true forever. It cannot be downloaded, so nagging about it would train
   * the person to dismiss the dialog — and the modal still surfaces the missing
   * photo with the 13-60 retry link while any OTHER artefact is outstanding.
   */
  promptRequired: boolean;
}

/**
 * Record that a staff member took an artefact.
 *
 * ⚠️ AWAITED, not fire-and-forget. `AuditService.logAction` is `void`-returning
 * and un-awaitable — the same shape that silently loses the last row of every
 * batch ([[pattern-void-helper-loses-last-batch-row]]). Here the consequence
 * would be quieter and worse: AC8.2 asks for an assertion on the download audit
 * rows, and a floating write is a race in the test and a lost row under load.
 *
 * Never throws: the person has their file, and failing the download because we
 * could not write a log would be the tail wagging the dog. The failure IS
 * logged, so a silent gap in the operator view has a corresponding line in the
 * API's stderr.
 */
export async function recordArtefactDownload(params: {
  userId: string;
  kind: ArtefactKind;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await AuditService.logActionTx(tx, {
        actorId: params.userId,
        action: ACTION_BY_KIND[params.kind],
        targetResource: 'users',
        targetId: params.userId,
        details: { artefact: params.kind },
        ipAddress: params.ipAddress || 'unknown',
        userAgent: params.userAgent || 'unknown',
      });
    });
  } catch (err: unknown) {
    logger.warn({
      event: 'staff_artefact.download_audit_failed',
      userId: params.userId,
      artefact: params.kind,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Most-recent download timestamp per artefact, for ONE user.
 *
 * ⚠️ AGGREGATED IN THE DATABASE, not in JavaScript (review H2). The first cut
 * selected every matching row ordered by `created_at` and then called `.find()`
 * on the result — unbounded, so a person who re-downloads their card weekly for
 * a year drags 50+ rows across the wire to read two of them. `MAX(created_at)
 * GROUP BY action` returns at most two rows, always.
 *
 * `audit_logs` is also indexed on `(actor_id, action, created_at DESC)` as of
 * this review — before it, this was a sequential scan of an append-only table
 * that grows for the life of the platform, on the dashboard's hot path.
 */
export async function getDownloadTimestamps(
  userId: string,
): Promise<Record<ArtefactKind, Date | null>> {
  const rows = await db
    .select({ action: auditLogs.action, lastAt: max(auditLogs.createdAt) })
    .from(auditLogs)
    .where(and(eq(auditLogs.actorId, userId), inArray(auditLogs.action, DOWNLOAD_ACTIONS)))
    .groupBy(auditLogs.action);

  return {
    id_card: rows.find((r) => r.action === AUDIT_ACTIONS.STAFF_ID_CARD_DOWNLOADED)?.lastAt ?? null,
    briefing: rows.find((r) => r.action === AUDIT_ACTIONS.STAFF_BRIEFING_DOWNLOADED)?.lastAt ?? null,
  };
}

/**
 * Bulk variant for the operator's staff list (AC7.3).
 *
 * One query for the whole page rather than one per row — the staff list already
 * runs two queries for twenty rows and this must not turn it into forty-two.
 */
export async function getDownloadTimestampsForUsers(
  userIds: string[],
): Promise<Map<string, Record<ArtefactKind, Date | null>>> {
  const result = new Map<string, Record<ArtefactKind, Date | null>>();
  for (const id of userIds) result.set(id, { id_card: null, briefing: null });
  if (userIds.length === 0) return result;

  // Aggregated per (person, artefact) in the database — at most two rows per
  // staff member on the page, rather than every download they have ever made.
  const rows = await db
    .select({
      actorId: auditLogs.actorId,
      action: auditLogs.action,
      lastAt: max(auditLogs.createdAt),
    })
    .from(auditLogs)
    .where(and(inArray(auditLogs.actorId, userIds), inArray(auditLogs.action, DOWNLOAD_ACTIONS)))
    .groupBy(auditLogs.actorId, auditLogs.action);

  for (const row of rows) {
    if (!row.actorId) continue;
    const entry = result.get(row.actorId);
    if (!entry) continue;
    const kind: ArtefactKind =
      row.action === AUDIT_ACTIONS.STAFF_ID_CARD_DOWNLOADED ? 'id_card' : 'briefing';
    entry[kind] = row.lastAt;
  }

  return result;
}

/**
 * The full artefact picture for one staff member.
 *
 * @param user the caller's own row — role name and whether a printable card
 *   exists. `hasIdCardPhoto` is keyed on `live_selfie_id_card_url`, which is
 *   the EXACT condition `user.controller.ts` refuses card generation on, so the
 *   modal cannot promise a download the endpoint will reject (AC5.3).
 */
export async function getStaffArtefactState(user: {
  id: string;
  roleName: string;
  hasIdCardPhoto: boolean;
}): Promise<StaffArtefactState> {
  const idCardApplicable = isIdCardRole(user.roleName);
  const briefingApplicable = isBriefingRole(user.roleName);

  /*
   * ⚠️ APPLICABILITY FIRST, THEN THE DATABASE (review H2).
   *
   * `StaffArtefactsModal` is mounted on `DashboardLayout`, which is the ONLY
   * dashboard layout in the app — it hosts the `public_user` routes too. So
   * this function runs on every dashboard page load for every authenticated
   * person on the platform, and the first cut queried `audit_logs` before it
   * checked whether the caller was entitled to anything at all. Citizens are
   * entitled to neither artefact and will never have a download row; asking an
   * append-only table that grows for the life of the platform is a pure cost.
   *
   * The registry is about to take a public blast. This branch is what keeps
   * that traffic off the audit table.
   */
  if (!idCardApplicable && !briefingApplicable) {
    const none: ArtefactState = {
      applicable: false,
      available: false,
      unavailableReason: null,
      downloadedAt: null,
    };
    return { idCard: none, briefing: { ...none }, promptRequired: false };
  }

  const downloads = await getDownloadTimestamps(user.id);
  const briefingPresent = isBriefingAvailable();

  const idCard: ArtefactState = {
    applicable: idCardApplicable,
    available: idCardApplicable && user.hasIdCardPhoto,
    unavailableReason: idCardApplicable && !user.hasIdCardPhoto ? 'photo_missing' : null,
    downloadedAt: downloads.id_card?.toISOString() ?? null,
  };

  const briefing: ArtefactState = {
    applicable: briefingApplicable,
    available: briefingApplicable && briefingPresent,
    unavailableReason: briefingApplicable && !briefingPresent ? 'briefing_source_missing' : null,
    downloadedAt: downloads.briefing?.toISOString() ?? null,
  };

  return {
    idCard,
    briefing,
    promptRequired: isOutstanding(idCard) || isOutstanding(briefing),
  };
}

/**
 * ONE definition of "this person still owes themselves this artefact".
 *
 * ⚠️ `available` is part of it, and that is the whole subtlety (review M2). An
 * enumerator whose photo never saved (13-60's swallow) CANNOT download a card,
 * so counting it as outstanding would nag them forever about something they
 * cannot act on — and a dialog that cannot be satisfied is one people learn to
 * dismiss, which costs us the briefing too.
 *
 * The first cut applied this rule to the modal and a DIFFERENT rule to the
 * operator's screen, which listed that same person as "Not taken: ID card"
 * indefinitely: the app had stopped asking while the operator was still being
 * told they were unready. Both surfaces now call this. Someone who cannot be
 * issued a card appears under 13-60's "No ID photo" column, which is the
 * question that actually describes their situation — the two columns partition
 * "is this person ready to go out?" instead of overlapping on it.
 */
export function isOutstanding(state: ArtefactState): boolean {
  return state.applicable && state.available && state.downloadedAt === null;
}

/**
 * The same verdict, for a row the operator's staff list already has in hand.
 *
 * Exists so `staff.service.ts` can answer "what does this person still owe?"
 * without a second round trip AND without a second opinion — the browser used
 * to compute this from raw timestamps plus its own copy of the role rules
 * (review H3). One rule, three surfaces: the modal, the profile page and the
 * operator's column all resolve through `isOutstanding`.
 */
export function outstandingFor(row: {
  roleName: string;
  hasIdCardPhoto: boolean;
  idCardDownloadedAt: Date | null;
  briefingDownloadedAt: Date | null;
}): ArtefactKind[] {
  const idCardApplicable = isIdCardRole(row.roleName);
  const briefingApplicable = isBriefingRole(row.roleName);
  const outstanding: ArtefactKind[] = [];

  if (
    isOutstanding({
      applicable: idCardApplicable,
      available: idCardApplicable && row.hasIdCardPhoto,
      unavailableReason: null,
      downloadedAt: row.idCardDownloadedAt?.toISOString() ?? null,
    })
  ) {
    outstanding.push('id_card');
  }

  if (
    isOutstanding({
      applicable: briefingApplicable,
      available: briefingApplicable && isBriefingAvailable(),
      unavailableReason: null,
      downloadedAt: row.briefingDownloadedAt?.toISOString() ?? null,
    })
  ) {
    outstanding.push('briefing');
  }

  return outstanding;
}

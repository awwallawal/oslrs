import { db } from '../lib/offline-db';
import { submitSurvey, fetchSubmissionStatuses } from '../features/forms/api/submission.api';
import { ApiError } from '../lib/api-client';

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 8000;
const MAX_RETRIES = 3;
const SUBMISSION_TIMEOUT = 60_000;
const RECONNECT_DEBOUNCE = 1000;
const POLL_DELAYS = [5_000, 15_000, 30_000]; // 5s, 15s, 30s escalating

function getRetryDelay(retryCount: number): number {
  return Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
}

/**
 * Is this failure PERMANENT — i.e. will an identical retry always fail?
 *
 * 13-4, 2026-08-06. This used to be a single string test, `error.includes('NIN_DUPLICATE')`, and
 * everything else was assumed retryable. A real prod smoke hit
 * `Submission is missing required answer(s): employment_status` — a 422 that can never succeed —
 * and it retried forever. Worse, `retryFailed()` resets `retryCount` to 0, so each press of the
 * operator's own "Retry Failed" button re-armed it. The only escape was the browser console, which
 * a field enumerator does not have.
 *
 * Classify on the HTTP STATUS, not the message. A message is prose that changes when someone edits
 * a string; the status is the contract. 4xx means "this request is wrong" and resending it
 * unchanged cannot help — EXCEPT 408 and 429, which are explicitly "try again", and 401/403, where
 * a token refresh or re-login legitimately changes the outcome.
 *
 * Anything without a status (network drop, timeout, offline) stays retryable — that is the ordinary
 * field condition this queue exists for.
 */
export function isPermanentFailure(err: unknown): { permanent: boolean; status?: number } {
  if (err instanceof ApiError) {
    const s = err.status;
    const retryableClientErrors = s === 408 || s === 429 || s === 401 || s === 403;
    return { permanent: s >= 400 && s < 500 && !retryableClientErrors, status: s };
  }
  // Legacy rows + the ingestion-time NIN_DUPLICATE discovered by polling, which never had a status.
  if (err instanceof Error && err.message.includes('NIN_DUPLICATE')) return { permanent: true };
  return { permanent: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SyncManager {
  private _syncing = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _onlineHandler: (() => void) | null = null;
  private _userId: string | null = null;

  setUserId(id: string | null): void {
    this._userId = id;
  }

  getUserId(): string | null {
    return this._userId;
  }

  init(): void {
    this._onlineHandler = () => {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
      }
      this._reconnectTimer = setTimeout(() => {
        this.syncAll();
      }, RECONNECT_DEBOUNCE);
    };
    window.addEventListener('online', this._onlineHandler);
  }

  destroy(): void {
    if (this._onlineHandler) {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async syncNow(): Promise<void> {
    return this.syncAll();
  }

  async retryFailed(): Promise<void> {
    if (!this._userId) return; // No user — skip

    // Reset all failed items to pending with retryCount=0 and clear error
    // Skip permanently failed items (NIN_DUPLICATE — not retryable)
    const failedItems = await db.submissionQueue
      .where({ status: 'failed', userId: this._userId })
      .toArray();

    for (const item of failedItems) {
      // Permanently rejected rows are NOT re-armed. Resetting retryCount on an error that can
      // never succeed is what turned one bad submission into an unclearable banner.
      if (item.permanentFailure || item.error?.includes('NIN_DUPLICATE')) continue;
      await db.submissionQueue.update(item.id, {
        status: 'pending',
        retryCount: 0,
        error: null,
      });
    }

    return this.syncAll();
  }

  /**
   * Remove a queue item the operator has decided to abandon.
   *
   * 13-4, 2026-08-06. The classification fix above stops a permanently-rejected submission from
   * retrying — but on its own that just parks it in the banner forever, which is not better. An
   * enumerator in the field has no browser console; without this the only escape from ONE bad
   * submission was clearing site data, which would take every unsynced survey with it.
   *
   * Deliberately NOT restricted to permanent failures at the service layer — the caller decides,
   * and the UI only offers it where discarding is the right answer. Deliberately a hard delete: a
   * row the server never accepted has no server-side counterpart to reconcile, and keeping
   * tombstones in a device-local queue would be hoarding, not audit.
   */
  async discard(id: string): Promise<void> {
    await db.submissionQueue.delete(id);
  }

  /**
   * 13-4 AC4.3b — put a permanently-rejected entry BACK into the drafts list so it can be fixed
   * and resubmitted, instead of only being thrown away.
   *
   * This corrects the Discard-only design shipped hours earlier. `useDraftPersistence` DELETES the
   * draft at submit, on the reasoning that "the queue item has all data needed for sync" — true
   * only while the queue item exists. Discard therefore destroyed **the only remaining copy of the
   * interview**, confirmed empirically: after the first failed row was removed, the drafts store
   * returned NO DRAFTS.
   *
   * For the failure that actually occurred — one required answer missing — the right response is
   * obvious once stated: reopen it, fill the field, resubmit. **Nobody should re-interview a
   * citizen because a form was one answer short.**
   *
   * Reuses the SAME id, so the restored draft keeps its `_referenceCode` and its identity across
   * the queue and the drafts table.
   */
  async restoreToDraft(id: string): Promise<boolean> {
    const item = await db.submissionQueue.get(id);
    if (!item) return false;

    const raw = (item.payload?.rawData ?? item.payload ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    await db.drafts.put({
      id: item.id,
      formId: item.formId,
      formVersion: String((item.payload?.formVersion as string | undefined) ?? '1'),
      responses: raw,
      // Land on the first question; the operator is looking for one missing answer and the
      // completeness error names it. Jumping blind into the middle is worse than starting over.
      questionPosition: 0,
      status: 'in-progress',
      userId: item.userId,
      createdAt: item.createdAt,
      updatedAt: now,
    });

    // Drop the queue row LAST: if the put above throws, the entry is still queued and recoverable
    // rather than lost between two tables.
    await db.submissionQueue.delete(id);
    return true;
  }

  async syncAll(): Promise<void> {
    if (this._syncing) return;
    if (!navigator.onLine) return;
    if (!this._userId) return; // No user — skip sync

    this._syncing = true;
    const syncedIds: string[] = [];

    try {
      // Process pending items (scoped to current user)
      const pendingItems = await db.submissionQueue
        .where({ status: 'pending', userId: this._userId })
        .toArray();

      for (const item of pendingItems) {
        if (!this._userId) break; // Mid-batch guard: user logged out
        if (item.retryCount >= MAX_RETRIES) continue;
        const synced = await this._syncItem(item.id, item.formId, item.payload, item.retryCount);
        if (synced) syncedIds.push(item.id);
      }

      // Process failed items eligible for retry (scoped to current user)
      const failedItems = this._userId
        ? await db.submissionQueue
            .where({ status: 'failed', userId: this._userId })
            .toArray()
        : [];

      for (const item of failedItems) {
        if (!this._userId) break; // Mid-batch guard: user logged out
        if (item.retryCount >= MAX_RETRIES) continue;
        if (item.permanentFailure || item.error?.includes('NIN_DUPLICATE')) continue;

        // Check backoff delay
        if (item.lastAttempt) {
          const elapsed = Date.now() - new Date(item.lastAttempt).getTime();
          const delay = getRetryDelay(item.retryCount);
          if (elapsed < delay) continue;
        }

        const synced = await this._syncItem(item.id, item.formId, item.payload, item.retryCount);
        if (synced) syncedIds.push(item.id);
      }
    } finally {
      this._syncing = false;
    }

    // Poll for processing results of newly synced submissions (fire-and-forget)
    if (syncedIds.length > 0) {
      this._pollSubmissionStatuses(syncedIds).catch(() => {
        // Polling failure is non-critical — ingestion result discovered on next session
      });
    }
  }

  private async _syncItem(
    id: string,
    formId: string,
    payload: Record<string, unknown>,
    retryCount: number,
  ): Promise<boolean> {
    const now = new Date().toISOString();

    // Mark as syncing
    await db.submissionQueue.update(id, { status: 'syncing', lastAttempt: now });

    try {
      // Extract enriched fields from payload (set by completeDraft)
      const responses = (payload.responses as Record<string, unknown>) ?? payload;
      const formVersion = (payload.formVersion as string) ?? '1.0.0';
      const submittedAt = (payload.submittedAt as string) ?? now;
      const gpsLatitude = payload.gpsLatitude as number | undefined;
      const gpsLongitude = payload.gpsLongitude as number | undefined;
      const completionTimeSeconds = payload.completionTimeSeconds as number | undefined;

      const result = await Promise.race([
        submitSurvey({
          submissionId: id,
          formId,
          formVersion,
          responses,
          submittedAt,
          ...(gpsLatitude != null && { gpsLatitude }),
          ...(gpsLongitude != null && { gpsLongitude }),
          ...(completionTimeSeconds != null && { completionTimeSeconds }),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Submission timeout')), SUBMISSION_TIMEOUT),
        ),
      ]);

      // Both 'queued' and 'duplicate' mean success. Story 9-58 — persist the
      // human-friendly reference code echoed by the API so the completion
      // screen can read it back to the field officer (online submits).
      await db.submissionQueue.update(id, {
        status: 'synced',
        error: null,
        referenceCode: result?.data?.referenceCode ?? null,
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const { permanent, status } = isPermanentFailure(err);
      await db.submissionQueue.update(id, {
        status: 'failed',
        error: errorMessage,
        // Park it at MAX_RETRIES too, so any code path that only checks the counter also stops.
        retryCount: permanent ? MAX_RETRIES : retryCount + 1,
        permanentFailure: permanent,
        failureStatus: status,
        lastAttempt: now,
      });
      return false;
    }
  }

  /**
   * Poll submission processing status with escalating delays (AC 3.7.6).
   * Discovers NIN_DUPLICATE rejections that happened during ingestion
   * and marks local entries as permanently failed.
   */
  private async _pollSubmissionStatuses(uids: string[]): Promise<void> {
    for (const delay of POLL_DELAYS) {
      await sleep(delay);
      if (!navigator.onLine) break;

      try {
        const statuses = await fetchSubmissionStatuses(uids);

        for (const uid of [...uids]) {
          const status = statuses[uid];
          if (!status?.processed) continue;

          if (status.processingError?.includes('NIN_DUPLICATE')) {
            await db.submissionQueue.update(uid, {
              status: 'failed',
              error: status.processingError,
              retryCount: MAX_RETRIES,
            });
          }
          // Remove processed UIDs from future polls
          uids = uids.filter(u => u !== uid);
        }

        // All UIDs processed — stop polling
        if (uids.length === 0) break;
      } catch {
        // API error during polling — skip this attempt, try again next delay
      }
    }
  }
}

// Singleton instance
export const syncManager = new SyncManager();

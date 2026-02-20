import { db } from '../lib/offline-db';
import { submitSurvey, fetchSubmissionStatuses } from '../features/forms/api/submission.api';

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 8000;
const MAX_RETRIES = 3;
const SUBMISSION_TIMEOUT = 60_000;
const RECONNECT_DEBOUNCE = 1000;
const POLL_DELAYS = [5_000, 15_000, 30_000]; // 5s, 15s, 30s escalating

function getRetryDelay(retryCount: number): number {
  return Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
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
      if (item.error?.includes('NIN_DUPLICATE')) continue;
      await db.submissionQueue.update(item.id, {
        status: 'pending',
        retryCount: 0,
        error: null,
      });
    }

    return this.syncAll();
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
        if (item.error?.includes('NIN_DUPLICATE')) continue;

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

      await Promise.race([
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

      // Both 'queued' and 'duplicate' mean success
      await db.submissionQueue.update(id, { status: 'synced', error: null });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await db.submissionQueue.update(id, {
        status: 'failed',
        error: errorMessage,
        retryCount: retryCount + 1,
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

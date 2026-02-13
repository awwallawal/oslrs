import { db } from '../lib/offline-db';
import { submitSurvey } from '../features/forms/api/submission.api';

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 8000;
const MAX_RETRIES = 3;
const SUBMISSION_TIMEOUT = 60_000;
const RECONNECT_DEBOUNCE = 1000;

function getRetryDelay(retryCount: number): number {
  return Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
}

export class SyncManager {
  private _syncing = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _onlineHandler: (() => void) | null = null;

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
    // Reset all failed items to pending with retryCount=0 and clear error
    const failedItems = await db.submissionQueue
      .where({ status: 'failed' })
      .toArray();

    for (const item of failedItems) {
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

    this._syncing = true;

    try {
      // Process pending items
      const pendingItems = await db.submissionQueue
        .where({ status: 'pending' })
        .toArray();

      for (const item of pendingItems) {
        if (item.retryCount >= MAX_RETRIES) continue;
        await this._syncItem(item.id, item.formId, item.payload, item.retryCount);
      }

      // Process failed items eligible for retry
      const failedItems = await db.submissionQueue
        .where({ status: 'failed' })
        .toArray();

      for (const item of failedItems) {
        if (item.retryCount >= MAX_RETRIES) continue;

        // Check backoff delay
        if (item.lastAttempt) {
          const elapsed = Date.now() - new Date(item.lastAttempt).getTime();
          const delay = getRetryDelay(item.retryCount);
          if (elapsed < delay) continue;
        }

        await this._syncItem(item.id, item.formId, item.payload, item.retryCount);
      }
    } finally {
      this._syncing = false;
    }
  }

  private async _syncItem(
    id: string,
    formId: string,
    payload: Record<string, unknown>,
    retryCount: number,
  ): Promise<void> {
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

      await Promise.race([
        submitSurvey({
          submissionId: id,
          formId,
          formVersion,
          responses,
          submittedAt,
          ...(gpsLatitude != null && { gpsLatitude }),
          ...(gpsLongitude != null && { gpsLongitude }),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Submission timeout')), SUBMISSION_TIMEOUT),
        ),
      ]);

      // Both 'queued' and 'duplicate' mean success
      await db.submissionQueue.update(id, { status: 'synced', error: null });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await db.submissionQueue.update(id, {
        status: 'failed',
        error: errorMessage,
        retryCount: retryCount + 1,
        lastAttempt: now,
      });
    }
  }
}

// Singleton instance
export const syncManager = new SyncManager();

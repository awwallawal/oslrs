/**
 * Enumerator Sync Status Page
 *
 * Story 2.5-5 AC4: Sidebar link target for Sync Status.
 * Story 3.3 AC1, AC4, AC8, AC9: Full queue UI with live submission list.
 */

import { Upload, RotateCcw, Inbox, CheckCircle, Clock, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SubmissionQueueItem } from '../../../lib/offline-db';
import { Card, CardContent } from '../../../components/ui/card';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { useSyncStatus } from '../../forms/hooks/useSyncStatus';
import { useAuth } from '../../auth/context/AuthContext';
import { syncManager } from '../../../services/sync-manager';

/** Cap queue items rendered to prevent unbounded DOM growth */
const MAX_QUEUE_DISPLAY = 100;

const statusConfig: Record<
  SubmissionQueueItem['status'],
  { label: string; classes: string; icon: typeof CheckCircle }
> = {
  pending: { label: 'Pending', classes: 'bg-amber-100 text-amber-600', icon: Clock },
  syncing: { label: 'Syncing', classes: 'bg-blue-100 text-blue-600', icon: Loader2 },
  synced: { label: 'Synced', classes: 'bg-emerald-100 text-emerald-600', icon: CheckCircle },
  failed: { label: 'Failed', classes: 'bg-red-100 text-red-600', icon: AlertCircle },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function EnumeratorSyncPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { status, pendingCount, failedCount, rejectedCount, syncingCount } = useSyncStatus();
  const items = useLiveQuery(
    () =>
      userId
        ? db.submissionQueue.where({ userId }).sortBy('createdAt').then((arr) => arr.reverse().slice(0, MAX_QUEUE_DISPLAY))
        : Promise.resolve([] as SubmissionQueueItem[]),
    [userId],
  ) ?? [];

  // Rejected outright by the server — retry is meaningless here, discard is the only exit (13-4).
  const permanentItems = items.filter((i) => i.permanentFailure);

  // Look up form names from cache
  const formSchemas = useLiveQuery(() => db.formSchemaCache.toArray()) ?? [];
  const formNameMap = new Map(
    formSchemas.map((s) => [s.formId, (s.schema as { title?: string }).title ?? s.formId]),
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">Sync Status</h1>
          <p className="text-neutral-600 mt-1">Data synchronization and upload status</p>
        </div>
        <SyncStatusBadge status={status} pendingCount={pendingCount} failedCount={failedCount} rejectedCount={rejectedCount} />
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => syncManager.syncNow()}
          disabled={syncingCount > 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncingCount > 0 ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {syncingCount > 0 ? 'Uploading...' : 'Upload Now'}
        </button>
        {failedCount > 0 && (
          <button
            onClick={() => syncManager.retryFailed()}
            disabled={syncingCount > 0}
            data-testid="retry-failed-button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncingCount > 0 ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            {syncingCount > 0 ? 'Retrying...' : 'Retry Failed'}
          </button>
        )}
        {/*
          13-4 — a PERMANENTLY rejected submission cannot be retried into success, so offering only
          "Retry Failed" left the operator pressing a button that could never work (and which, until
          today, re-armed the item on every press). Discard is the honest action for these, and it
          is the only escape an enumerator has: there is no browser console on a field phone.
        */}
        {/*
          13-4 AC4.3b — RESTORE is the primary action on a rejected entry; Discard is the fallback.
          The draft is deleted at submit, so discarding a failed row destroys the only copy of the
          interview and the respondent must be seen again. For the failure that actually happened —
          one missing required answer — reopening and fixing it is obviously right.
        */}
        {permanentItems.length > 0 && (
          <button
            onClick={async () => {
              const n = permanentItems.length;
              if (!window.confirm(
                'Reopen ' + n + ' rejected entry(ies) as drafts so the missing answers can be ' +
                'filled in and resubmitted? Nothing is lost.',
              )) return;
              for (const i of permanentItems) await syncManager.restoreToDraft(i.id);
            }}
            data-testid="restore-permanent-button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reopen {permanentItems.length} rejected
          </button>
        )}
        {permanentItems.length > 0 && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Discard ${permanentItems.length} submission(s) the server permanently rejected? ` +
                    'They were never saved, and retrying cannot make them succeed. ' +
                    'THIS DELETES THE ONLY COPY OF THE INTERVIEW — each respondent must be seen ' +
                    'again from scratch. Prefer "Reopen" unless the entry is genuinely unwanted.',
                )
              ) {
                permanentItems.forEach((i) => void syncManager.discard(i.id));
              }
            }}
            data-testid="discard-permanent-button"
            className="inline-flex items-center gap-2 px-4 py-2 border border-error-300 text-error-700 hover:bg-error-50 text-sm font-medium rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Discard {permanentItems.length} rejected
          </button>
        )}
      </div>

      {/* Queue list */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="w-10 h-10 text-neutral-300 mb-3" />
            <p className="text-neutral-500 text-sm">
              No submissions yet. Start a survey to see sync status here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const cfg = statusConfig[item.status];
            const Icon = cfg.icon;
            const formName = formNameMap.get(item.formId) ?? `Form ${item.formId.slice(0, 8)}`;
            /**
             * 13-4 AC4.4b (2026-08-07) — WHO this entry is, and WHAT number they were given.
             *
             * AC4.4 stopped the completion screen showing a provisional code, because the server
             * overwrites it unconditionally and it can never be the stored value. That removed a
             * wrong number without providing the right one — Awwal caught the gap: **if the
             * enumerator cannot read a number out at the end of the interview, they need somewhere
             * to get it afterwards.** This is that place.
             *
             * The name comes from the payload so a row is identifiable BEFORE it syncs, when there
             * is no code yet — "which of today's twelve is still stuck?" is unanswerable against a
             * list of identical form names and timestamps.
             */
            const raw = (item.payload?.rawData ?? item.payload ?? {}) as Record<string, unknown>;
            const person = [raw.firstname, raw.surname].filter((v) => typeof v === 'string' && v).join(' ').trim();
            return (
              <Card key={item.id} data-testid="queue-item">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {person || formName}
                      </p>
                      {/*
                        The reference code is shown ONLY on a synced row — the same rule as the
                        completion screen. An unsynced row has no server code, and printing the
                        provisional one here would reintroduce exactly the defect AC4.4 removed.
                      */}
                      {item.status === 'synced' && item.referenceCode ? (
                        <p
                          className="font-mono text-sm font-semibold text-primary-700 mt-0.5 select-all"
                          data-testid="queue-item-reference"
                        >
                          {item.referenceCode}
                          <span className="ml-2 font-sans text-xs font-normal text-neutral-500">
                            give this to the respondent
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600 mt-0.5" data-testid="queue-item-reference-pending">
                          No number yet — not uploaded
                        </p>
                      )}
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {person ? `${formName} · ` : ''}
                        {formatTime(item.createdAt)}
                        {item.retryCount > 0 && (
                          <span className="ml-2">
                            Retries: {item.retryCount}
                          </span>
                        )}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                      )}
                    </div>
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}
                    >
                      <Icon
                        className={`w-3 h-3 ${item.status === 'syncing' ? 'animate-spin' : ''}`}
                      />
                      {cfg.label}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

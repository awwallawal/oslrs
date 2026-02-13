/**
 * Enumerator Sync Status Page
 *
 * Story 2.5-5 AC4: Sidebar link target for Sync Status.
 * Story 3.3 AC1, AC4, AC8, AC9: Full queue UI with live submission list.
 */

import { Upload, RotateCcw, Inbox, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SubmissionQueueItem } from '../../../lib/offline-db';
import { Card, CardContent } from '../../../components/ui/card';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { useSyncStatus } from '../../forms/hooks/useSyncStatus';
import { syncManager } from '../../../services/sync-manager';

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
  const { status, pendingCount, failedCount, syncingCount } = useSyncStatus();
  const items = useLiveQuery(() =>
    db.submissionQueue.orderBy('createdAt').reverse().toArray(),
  ) ?? [];

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
        <SyncStatusBadge status={status} pendingCount={pendingCount} failedCount={failedCount} />
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => syncManager.syncNow()}
          disabled={syncingCount > 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          Upload Now
        </button>
        {failedCount > 0 && (
          <button
            onClick={() => syncManager.retryFailed()}
            disabled={syncingCount > 0}
            data-testid="retry-failed-button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            Retry Failed
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
            return (
              <Card key={item.id} data-testid="queue-item">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {formName}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
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

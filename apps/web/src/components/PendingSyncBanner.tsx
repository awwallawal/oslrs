import { AlertTriangle } from 'lucide-react';

interface PendingSyncBannerProps {
  pendingCount: number;
  failedCount: number;
  onSyncNow: () => void;
  onRetryFailed: () => void;
  isSyncing: boolean;
}

export function PendingSyncBanner({
  pendingCount,
  failedCount,
  onSyncNow,
  onRetryFailed,
  isSyncing,
}: PendingSyncBannerProps) {
  if (pendingCount <= 0 && failedCount <= 0) return null;

  const hasFailed = failedCount > 0;

  return (
    <div
      role="alert"
      data-testid="sync-banner"
      data-variant={hasFailed ? 'failed' : 'pending'}
      className="bg-red-600 text-white rounded-lg px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium">
          {hasFailed
            ? `${failedCount} survey(s) failed to sync. Tap 'Retry' to try again.`
            : `You have ${pendingCount} pending survey(s) waiting to sync. Connection will resume automatically when online.`}
        </span>
      </div>
      {hasFailed ? (
        <button
          onClick={onRetryFailed}
          disabled={isSyncing}
          className="shrink-0 px-3 py-1.5 bg-white text-red-600 text-sm font-semibold rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Retry
        </button>
      ) : (
        <button
          onClick={onSyncNow}
          disabled={isSyncing}
          className="shrink-0 px-3 py-1.5 bg-white text-red-600 text-sm font-semibold rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Upload Now
        </button>
      )}
    </div>
  );
}

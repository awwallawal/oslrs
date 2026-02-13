import { AlertTriangle, CheckCircle, Loader2, WifiOff } from 'lucide-react';
import type { SyncState } from '../features/forms/hooks/useSyncStatus';

interface SyncStatusBadgeProps {
  status: SyncState;
  pendingCount: number;
  failedCount: number;
}

const stateConfig = {
  synced: {
    icon: CheckCircle,
    label: 'Synced',
    classes: 'bg-emerald-100 text-emerald-600',
    animate: false,
    testState: 'synced',
  },
  syncing: {
    icon: Loader2,
    label: 'Syncing',
    classes: 'bg-amber-100 text-amber-600',
    animate: true,
    testState: 'syncing',
  },
  attention: {
    icon: AlertTriangle,
    label: 'Attention',
    classes: 'bg-orange-100 text-orange-600',
    animate: false,
    testState: 'attention',
  },
  offline: {
    icon: WifiOff,
    label: 'Offline',
    classes: 'bg-red-100 text-red-600',
    animate: false,
    testState: 'offline',
  },
} as const;

export function SyncStatusBadge({ status, pendingCount, failedCount }: SyncStatusBadgeProps) {
  // Hide badge when queue is empty (first-time user with no submissions)
  if (status === 'empty') return null;

  const config = stateConfig[status];
  const Icon = config.icon;
  const badgeCount = status === 'attention' ? failedCount : pendingCount;

  return (
    <div role="status" aria-live="polite">
      <div
        data-testid="sync-badge"
        data-state={config.testState}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.classes}`}
      >
        <Icon className={`w-4 h-4 ${config.animate ? 'animate-spin' : ''}`} />
        <span>{config.label}</span>
        {badgeCount > 0 && status !== 'synced' && (
          <span
            data-testid="pending-count"
            className="ml-0.5 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-current/10"
          >
            {badgeCount}
          </span>
        )}
      </div>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/offline-db';
import { useOnlineStatus } from '../../../hooks/useOnlineStatus';

export type SyncState = 'synced' | 'syncing' | 'attention' | 'offline' | 'empty';

interface UseSyncStatusReturn {
  status: SyncState;
  pendingCount: number;
  failedCount: number;
  rejectedCount: number;
  syncingCount: number;
  totalCount: number;
}

export function useSyncStatus(): UseSyncStatusReturn {
  const { isOnline } = useOnlineStatus();

  const items = useLiveQuery(() => db.submissionQueue.toArray()) ?? [];

  const totalCount = items.length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const syncingCount = items.filter((i) => i.status === 'syncing').length;
  const failedCount = items.filter((i) => i.status === 'failed' && !i.error?.includes('NIN_DUPLICATE')).length;
  const rejectedCount = items.filter((i) => i.status === 'failed' && i.error?.includes('NIN_DUPLICATE')).length;

  // Priority: offline > syncing > attention > synced > empty
  let status: SyncState;
  if (totalCount === 0) {
    status = 'empty';
  } else if (!isOnline) {
    status = 'offline';
  } else if (syncingCount > 0) {
    status = 'syncing';
  } else if (failedCount > 0) {
    status = 'attention';
  } else {
    status = 'synced';
  }

  return { status, pendingCount, failedCount, rejectedCount, syncingCount, totalCount };
}

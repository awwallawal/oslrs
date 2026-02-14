/**
 * Enumerator Dashboard Home
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard with Start Survey CTA,
 * Resume Draft, Daily Progress, Sync Status indicator.
 * Story 3.1: Start Survey navigates to surveys page.
 * Story 3.2 AC3: Persistent storage request + warning banner.
 * Story 3.3: Dynamic sync status badge + pending sync banner.
 */

import { useNavigate } from 'react-router-dom';
import { TrendingUp, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { StorageWarningBanner } from '../../../components/StorageWarningBanner';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { PendingSyncBanner } from '../../../components/PendingSyncBanner';
import { usePersistentStorage } from '../../../hooks/usePersistentStorage';
import { useSyncStatus } from '../../forms/hooks/useSyncStatus';
import { syncManager } from '../../../services/sync-manager';

export default function EnumeratorHome({ isLoading = false }: { isLoading?: boolean }) {
  const navigate = useNavigate();
  const { showWarning } = usePersistentStorage();
  const { status, pendingCount, failedCount, rejectedCount, syncingCount } = useSyncStatus();

  return (
    <div className="p-6">
      {showWarning && (
        <div className="mb-4">
          <StorageWarningBanner />
        </div>
      )}
      {/* Pending Sync Banner — Story 3.3 AC2, AC8 */}
      {(pendingCount > 0 || failedCount > 0) && (
        <div className="mb-4">
          <PendingSyncBanner
            pendingCount={pendingCount}
            failedCount={failedCount}
            onSyncNow={() => syncManager.syncNow()}
            onRetryFailed={() => syncManager.retryFailed()}
            isSyncing={syncingCount > 0}
          />
        </div>
      )}
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Enumerator Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Survey collection and progress tracking
        </p>
      </div>

      {/* Sync Status Badge — Story 3.3 AC1, AC7 (header area, hidden when empty) */}
      {!isLoading && (
        <div className="mb-4">
          <SyncStatusBadge status={status} pendingCount={pendingCount} failedCount={failedCount} rejectedCount={rejectedCount} />
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6">
          {/* Start Survey CTA — AC1, Story 3.1 */}
          <div className="md:col-span-2">
            <button
              onClick={() => navigate('/dashboard/enumerator/survey')}
              className="w-full md:w-auto min-h-[48px] px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg text-lg transition-colors"
            >
              Start Survey
            </button>
          </div>

          {/* Resume Draft Card — AC1 */}
          <Card data-testid="dashboard-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Save className="w-5 h-5 text-amber-600" />
                </div>
                <CardTitle className="text-base">Resume Draft</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Save className="w-8 h-8 text-neutral-300 mb-2" />
                <p className="text-neutral-500 text-sm">No drafts yet</p>
              </div>
            </CardContent>
          </Card>

          {/* Daily Progress Card — AC1 */}
          <Card data-testid="dashboard-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <CardTitle className="text-base">Daily Progress</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-neutral-900">0</span>
                  <span className="text-sm text-neutral-500">/ 25 surveys today</span>
                </div>
                {/* Progress bar at 0% */}
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: '0%' }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

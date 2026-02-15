/**
 * Enumerator Dashboard Home
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard with Start Survey CTA,
 * Resume Draft, Daily Progress, Sync Status indicator.
 * Story 3.1: Start Survey navigates to surveys page.
 * Story 3.2 AC3: Persistent storage request + warning banner.
 * Story 3.3: Dynamic sync status badge + pending sync banner.
 * prep-2: Live TotalSubmissionsCard, TodayProgressCard, SubmissionActivityChart.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { StorageWarningBanner } from '../../../components/StorageWarningBanner';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { PendingSyncBanner } from '../../../components/PendingSyncBanner';
import { usePersistentStorage } from '../../../hooks/usePersistentStorage';
import { useSyncStatus } from '../../forms/hooks/useSyncStatus';
import { syncManager } from '../../../services/sync-manager';
import { useMySubmissionCounts, useDailyCounts } from '../../forms/hooks/useForms';
import { TotalSubmissionsCard } from '../components/TotalSubmissionsCard';
import { TodayProgressCard } from '../components/TodayProgressCard';
import { SubmissionActivityChart } from '../components/SubmissionActivityChart';
import { DAILY_TARGETS, fillDateGaps, getTodayCount } from '../hooks/useDashboardStats';

export default function EnumeratorHome({ isLoading = false }: { isLoading?: boolean }) {
  const navigate = useNavigate();
  const { showWarning } = usePersistentStorage();
  const { status, pendingCount, failedCount, rejectedCount, syncingCount } = useSyncStatus();
  const [chartDays, setChartDays] = useState(7);

  const { data: counts, isLoading: countsLoading, error: countsError } = useMySubmissionCounts();
  const { data: dailyData, isLoading: dailyLoading, error: dailyError } = useDailyCounts(chartDays);

  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;
  const filledData = dailyData ? fillDateGaps(dailyData, chartDays) : [];
  const todayCount = getTodayCount(filledData);

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
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          <SkeletonCard className="col-span-full" />
          <SkeletonCard className="h-full lg:col-span-2" />
          <SkeletonCard className="h-full" />
          <SkeletonCard className="h-full" />
          <SkeletonCard className="h-full lg:col-span-2" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {/* Start Survey CTA — AC1, Story 3.1 */}
          <div className="col-span-full">
            <button
              onClick={() => navigate('/dashboard/enumerator/survey')}
              className="w-full md:w-auto min-h-[48px] px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg text-lg transition-colors"
            >
              Start Survey
            </button>
          </div>

          {/* Live data cards — prep-2 (bento: 2:1 ratio) */}
          <TodayProgressCard
            todayCount={todayCount}
            target={DAILY_TARGETS.enumerator}
            label="surveys today"
            isLoading={dailyLoading}
            error={dailyError}
            className="h-full lg:col-span-2"
          />
          <TotalSubmissionsCard
            total={total}
            label="Total Submissions"
            isLoading={countsLoading}
            error={countsError}
            className="h-full"
          />

          {/* Resume Draft Card — AC1 (bento: 1:2 ratio) */}
          <Card data-testid="dashboard-card" className="h-full">
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

          {/* Submission Activity Chart — prep-2 */}
          <SubmissionActivityChart
            data={filledData}
            target={DAILY_TARGETS.enumerator}
            days={chartDays}
            onDaysChange={setChartDays}
            isLoading={dailyLoading}
            error={dailyError}
            roleLabel="Survey"
            className="h-full lg:col-span-2"
          />
        </div>
      )}
    </div>
  );
}

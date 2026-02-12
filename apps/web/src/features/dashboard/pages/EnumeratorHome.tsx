/**
 * Enumerator Dashboard Home
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard with Start Survey CTA,
 * Resume Draft, Daily Progress, Sync Status indicator.
 * Story 3.1: Start Survey navigates to surveys page.
 * Story 3.2 AC3: Persistent storage request + warning banner.
 */

import { useNavigate } from 'react-router-dom';
import { TrendingUp, Save, Clock, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { StorageWarningBanner } from '../../../components/StorageWarningBanner';
import { usePersistentStorage } from '../../../hooks/usePersistentStorage';

export default function EnumeratorHome({ isLoading = false }: { isLoading?: boolean }) {
  const navigate = useNavigate();
  const { showWarning } = usePersistentStorage();

  return (
    <div className="p-6">
      {showWarning && (
        <div className="mb-4">
          <StorageWarningBanner />
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

      {/* Sync Status Badge — AC1 (header area) */}
      {!isLoading && (
        <div className="mb-4 flex items-center gap-2" role="status" aria-live="polite">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            <span>Synced</span>
          </div>
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last synced: just now
          </span>
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

/**
 * Public User Dashboard Home
 *
 * Story 2.5-8 AC1: Mobile-first dashboard with profile status, Survey CTA,
 * Marketplace opt-in, and "Coming Soon" teaser.
 * Story 2.5-8 AC2: Mobile-first layout (2-col max on tablet, single col mobile).
 * Story 3.5 AC3.5.5: SyncStatusBadge and PendingSyncBanner for sync visibility.
 * Story 3.5 AC3.5.7: AlertDialog removed, Start Survey navigates to surveys page.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, ClipboardList, Briefcase, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { Button } from '../../../components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { PendingSyncBanner } from '../../../components/PendingSyncBanner';
import { useSyncStatus } from '../../forms/hooks/useSyncStatus';
import { syncManager } from '../../../services/sync-manager';

export default function PublicUserHome({ isLoading = false }: { isLoading?: boolean }) {
  const navigate = useNavigate();
  const [showEpic7Modal, setShowEpic7Modal] = useState(false);
  const { status, pendingCount, failedCount, rejectedCount, syncingCount } = useSyncStatus();

  return (
    <div className="p-6">
      {/* Pending Sync Banner — Story 3.5 AC3.5.5 */}
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
          My Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Your profile, surveys, and marketplace status
        </p>
      </div>

      {/* Sync Status Badge — Story 3.5 AC3.5.5 (hidden when empty) */}
      {!isLoading && (
        <div className="mb-4">
          <SyncStatusBadge status={status} pendingCount={pendingCount} failedCount={failedCount} rejectedCount={rejectedCount} />
        </div>
      )}

      {isLoading ? (
        /* Skeleton loading — mirrors actual 2-col card grid */
        <div className="grid gap-6 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          {/* Dashboard Cards — AC1, AC2: 2-col max on tablet, single col mobile */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Profile Completion Card — AC1 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <UserCheck className="w-5 h-5 text-green-600" />
                  </div>
                  <CardTitle className="text-base">Profile Completion</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-600">2 of 5 steps complete</p>
                <div className="mt-2 w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full w-[40%]"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Complete Survey CTA Card — AC1, Story 3.5 AC3.5.7 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <ClipboardList className="w-5 h-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-base">Complete Survey</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-600 mb-3">
                  Complete your skills survey to be listed in the marketplace.
                </p>
                <Button
                  onClick={() => navigate('/dashboard/public/surveys')}
                  size="lg"
                  className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
                >
                  Start Survey
                </Button>
              </CardContent>
            </Card>

            {/* Marketplace Opt-In Card — AC1 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Briefcase className="w-5 h-5 text-purple-600" />
                  </div>
                  <CardTitle className="text-base">Marketplace Opt-In</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-600 mb-3">
                  Not yet opted in to the Skills Marketplace.
                </p>
                <Button
                  onClick={() => setShowEpic7Modal(true)}
                  size="lg"
                  className="w-full min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg"
                >
                  Learn More
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Coming Soon Teaser — AC1 */}
          <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
            <TrendingUp className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-base font-medium text-gray-600 mb-1">
              Coming Soon: Skills Marketplace Insights
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Once you opt into the marketplace, you'll see how employers are finding your skills.
            </p>
          </div>
        </>
      )}

      {/* Coming in Epic 7 Modal */}
      <AlertDialog open={showEpic7Modal} onOpenChange={setShowEpic7Modal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Coming in Epic 7</AlertDialogTitle>
            <AlertDialogDescription>
              The Skills Marketplace will let employers discover your profile. Opt-in and profile management are coming soon.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * ODK Health Page
 *
 * Dedicated page for monitoring ODK Central health status, managing sync failures,
 * and viewing submission gap analysis.
 *
 * @see Story 2.5-2 AC6: ODK Health Dedicated Page
 */

import { useState } from 'react';
import { HeartPulse, RefreshCw, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';
import { SkeletonCard, SkeletonTable } from '../../../components/skeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import {
  useOdkHealth,
  useTriggerHealthCheck,
  useSyncFailures,
  useRetrySyncFailure,
  useDismissSyncFailure,
} from '../hooks/useOdkHealth';

/**
 * Status badge styles
 */
const STATUS_STYLES = {
  healthy: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: CheckCircle,
    label: 'Healthy',
  },
  warning: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    icon: AlertTriangle,
    label: 'Warning',
  },
  error: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: XCircle,
    label: 'Error',
  },
} as const;

export default function OdkHealthPage() {
  const { data: healthData, isLoading: isLoadingHealth } = useOdkHealth();
  const { data: failuresData, isLoading: isLoadingFailures } = useSyncFailures();
  const triggerCheck = useTriggerHealthCheck();
  const retryFailure = useRetrySyncFailure();
  const dismissFailure = useDismissSyncFailure();

  const [dismissDialogId, setDismissDialogId] = useState<string | null>(null);

  const health = healthData?.data;
  const failures = failuresData?.data ?? [];

  const statusStyle = health ? STATUS_STYLES[health.status] : null;
  const StatusIcon = statusStyle?.icon ?? AlertTriangle;

  const handleDismissConfirm = () => {
    if (dismissDialogId) {
      dismissFailure.mutate(dismissDialogId);
      setDismissDialogId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          ODK Central Health
        </h1>
        <p className="text-neutral-600 mt-1">
          Monitor ODK Central connection status and manage sync failures
        </p>
      </div>

      {/* Connection Status Card */}
      {isLoadingHealth ? (
        <SkeletonCard />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${statusStyle?.bg ?? 'bg-neutral-100'}`}>
                  <HeartPulse className={`w-6 h-6 ${statusStyle?.text ?? 'text-neutral-500'}`} />
                </div>
                <div>
                  <CardTitle>Connection Status</CardTitle>
                  <CardDescription>ODK Central server health</CardDescription>
                </div>
              </div>
              <button
                onClick={() => triggerCheck.mutate()}
                disabled={triggerCheck.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${triggerCheck.isPending ? 'animate-spin' : ''}`} />
                {triggerCheck.isPending ? 'Checking...' : 'Check Now'}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              {/* Status Badge */}
              <div className="space-y-1">
                <span className="text-sm text-neutral-500">Status</span>
                <div className="flex items-center gap-2">
                  <StatusIcon className={`w-5 h-5 ${statusStyle?.text ?? 'text-neutral-500'}`} />
                  <span
                    className={`inline-block px-2.5 py-1 text-sm font-medium rounded-full ${
                      statusStyle?.bg ?? 'bg-neutral-100'
                    } ${statusStyle?.text ?? 'text-neutral-500'}`}
                  >
                    {statusStyle?.label ?? 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Last Check */}
              <div className="space-y-1">
                <span className="text-sm text-neutral-500">Last Check</span>
                <p className="text-sm font-medium text-neutral-900">
                  {health?.lastCheckAt
                    ? new Date(health.lastCheckAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '--'}
                </p>
              </div>

              {/* Consecutive Failures */}
              <div className="space-y-1">
                <span className="text-sm text-neutral-500">Consecutive Failures</span>
                <p className={`text-sm font-medium ${
                  (health?.consecutiveFailures ?? 0) > 0 ? 'text-red-600' : 'text-neutral-900'
                }`}>
                  {health?.consecutiveFailures ?? 0}
                </p>
              </div>

              {/* Project ID */}
              <div className="space-y-1">
                <span className="text-sm text-neutral-500">Project ID</span>
                <p className="text-sm font-medium text-neutral-900 font-mono">
                  {health?.projectId ?? '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Failures Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <CardTitle>Unresolved Sync Failures</CardTitle>
              <CardDescription>
                {failures.length === 0
                  ? 'No unresolved failures'
                  : `${failures.length} failure${failures.length !== 1 ? 's' : ''} requiring attention`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingFailures ? (
            <SkeletonTable rows={3} columns={5} />
          ) : failures.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">All sync operations are healthy</p>
              <p className="text-sm mt-1">No unresolved failures at this time.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Message</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Retries</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {failures.map((failure) => (
                    <tr key={failure.id} className="hover:bg-neutral-50">
                      <td className="py-3 px-4 text-sm">
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
                          {failure.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700 max-w-xs truncate">
                        {failure.message}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-500">
                        {new Date(failure.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-600">
                        {failure.retryCount}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => retryFailure.mutate(failure.id)}
                            disabled={retryFailure.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded hover:bg-primary-100 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </button>
                          <button
                            onClick={() => setDismissDialogId(failure.id)}
                            disabled={dismissFailure.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 bg-neutral-100 rounded hover:bg-neutral-200 disabled:opacity-50 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Dismiss
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission Gap Analysis (Placeholder) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <HeartPulse className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <CardTitle>Submission Gap Analysis</CardTitle>
              <CardDescription>
                Identify and backfill missing submissions from ODK Central
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-neutral-500">
            <p className="font-medium">Coming Soon</p>
            <p className="text-sm mt-1">
              Gap analysis and backfill functionality will be available in a future update.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dismiss Confirmation Dialog */}
      <AlertDialog open={dismissDialogId !== null} onOpenChange={(open) => !open && setDismissDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this failure?</AlertDialogTitle>
            <AlertDialogDescription>
              This failure will be marked as resolved and removed from the list.
              Make sure the underlying issue has been addressed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDismissConfirm}>
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

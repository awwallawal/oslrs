/**
 * OdkWarningBanner Component
 *
 * Displays a prominent warning banner when ODK Central has connection issues.
 * Shown when consecutiveFailures >= ODK_FAILURE_THRESHOLD (default: 3).
 *
 * @see Story 2.5-2 AC4: ODK Health Warning Banner
 */

import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { useTriggerHealthCheck } from '../hooks/useOdkHealth';

interface OdkWarningBannerProps {
  /** ISO 8601 timestamp of the last successful health check */
  lastCheckAt: string;
  /** Callback when "View Details" is clicked */
  onViewDetails: () => void;
}

/**
 * Warning banner for ODK Central connection issues.
 *
 * Displays a red/amber alert with:
 * - Message indicating connection issue
 * - Last successful check timestamp
 * - "View Details" button to navigate to ODK Health page
 * - "Retry Now" button to trigger manual health check
 *
 * @example
 * <OdkWarningBanner
 *   lastCheckAt="2026-01-31T10:30:00.000Z"
 *   onViewDetails={() => navigate('/dashboard/super-admin/odk-health')}
 * />
 */
export function OdkWarningBanner({ lastCheckAt, onViewDetails }: OdkWarningBannerProps) {
  const triggerCheck = useTriggerHealthCheck();

  const formattedTime = new Date(lastCheckAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      role="alert"
      className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-red-800">
            ODK Central Connection Issue
          </h3>
          <p className="mt-1 text-sm text-red-700">
            Last successful check: {formattedTime}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onViewDetails}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Details
          </button>
          <button
            onClick={() => triggerCheck.mutate()}
            disabled={triggerCheck.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${triggerCheck.isPending ? 'animate-spin' : ''}`} />
            {triggerCheck.isPending ? 'Checking...' : 'Retry Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

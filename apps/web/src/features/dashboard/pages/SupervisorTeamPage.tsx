/**
 * Supervisor Team Page
 *
 * Story 4.1: Supervisor Team Dashboard
 * Displays assigned enumerator roster with metrics and GPS map.
 */

import { useState } from 'react';
import { Users, MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard, SkeletonTable } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { useTeamMetrics, useTeamGps, supervisorKeys } from '../hooks/useSupervisor';
import type { EnumeratorMetric } from '../api/supervisor.api';
import { TeamGpsMap } from '../components/TeamGpsMap';

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active' || status === 'verified';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600'
      }`}
      data-testid="status-badge"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-neutral-400'}`} />
      {status}
    </span>
  );
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Unknown';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function EnumeratorRow({ enumerator }: { enumerator: EnumeratorMetric }) {
  return (
    <tr className="border-t border-neutral-100" data-testid="enumerator-row">
      <td className="py-3 px-4">
        <div className="font-medium text-neutral-900">{enumerator.fullName}</div>
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={enumerator.status} />
      </td>
      <td className="py-3 px-4 text-neutral-600 text-sm">
        {formatTimeAgo(enumerator.lastSubmittedAt)}
      </td>
      <td className="py-3 px-4 text-center">
        <span className="font-semibold text-neutral-900" data-testid="daily-count">
          {enumerator.dailyCount}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="font-semibold text-neutral-900" data-testid="weekly-count">
          {enumerator.weeklyCount}
        </span>
      </td>
    </tr>
  );
}

export default function SupervisorTeamPage() {
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useTeamMetrics();
  const { data: gps, isLoading: gpsLoading, error: gpsError } = useTeamGps();

  const isLoading = metricsLoading || gpsLoading;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: supervisorKeys.all });
    setLastUpdated(new Date());
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Team Progress</h1>
        <p className="text-neutral-600 mt-1">Monitor your assigned enumerators</p>
      </div>

      {/* Last Updated + Refresh */}
      <div className="flex items-center gap-2 mb-4 text-sm text-neutral-500">
        <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
        <button
          onClick={handleRefresh}
          className="p-1 rounded hover:bg-neutral-100 transition-colors"
          aria-label="Refresh team data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Loading state — skeleton layout matching content shape (A2) */}
      {isLoading && (
        <div className="space-y-6" data-testid="team-loading">
          <SkeletonTable rows={4} columns={5} />
          <SkeletonCard className="h-64" />
        </div>
      )}

      {/* Error state */}
      {!isLoading && metricsError && (
        <Card data-testid="team-error">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-neutral-700 font-medium">Unable to load team data</p>
            <p className="text-sm text-neutral-500 mt-1">Please try refreshing the page.</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state — no enumerators assigned */}
      {!isLoading && !metricsError && metrics && metrics.enumerators.length === 0 && (
        <Card data-testid="team-empty">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-neutral-300 mb-4" />
            <p className="text-neutral-500 font-medium">No enumerators assigned yet</p>
            <p className="text-sm text-neutral-400 mt-1">
              Enumerators will appear here once assigned to your team.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Data loaded — show roster and map */}
      {!isLoading && !metricsError && metrics && metrics.enumerators.length > 0 && (
        <div className="space-y-6">
          {/* Team Roster Table */}
          <Card data-testid="team-roster">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <CardTitle className="text-base">
                  Team Roster ({metrics.enumerators.length})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Team roster">
                  <thead>
                    <tr className="text-left text-neutral-500 text-xs uppercase tracking-wider">
                      <th className="py-2 px-4 font-medium">Name</th>
                      <th className="py-2 px-4 font-medium">Status</th>
                      <th className="py-2 px-4 font-medium">Last Sync</th>
                      <th className="py-2 px-4 font-medium text-center">Today</th>
                      <th className="py-2 px-4 font-medium text-center">This Week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.enumerators.map((e: EnumeratorMetric) => (
                      <EnumeratorRow key={e.id} enumerator={e} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* GPS Map Panel */}
          <Card data-testid="team-map">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                </div>
                <CardTitle className="text-base">Latest Submission Locations</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {gpsError && (
                <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="map-error">
                  <AlertCircle className="w-8 h-8 text-neutral-400 mb-2" />
                  <p className="text-sm text-neutral-500">Unable to load map data</p>
                </div>
              )}
              {!gpsError && gps && gps.points.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="map-empty">
                  <MapPin className="w-8 h-8 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">No GPS data available yet</p>
                </div>
              )}
              {!gpsError && gps && gps.points.length > 0 && (
                <ErrorBoundary
                  fallbackProps={{
                    title: 'Map Error',
                    description: 'Unable to render the GPS map. The team roster above is still available.',
                    showHomeLink: false,
                  }}
                >
                  <TeamGpsMap points={gps.points} />
                </ErrorBoundary>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Verification Assessor Dashboard Home
 *
 * Story 2.5-7 AC1: Audit-focused dashboard with Verification Queue, Recent Activity,
 * Evidence Panel placeholder, and Quick Filters.
 * Story 2.5-7 AC2: Evidence display placeholder for GPS clustering, completion times,
 * response patterns (Epic 5 wiring).
 * Story 2.5-7 AC8: SkeletonCard loading branch.
 * Story 2.5-7 AC10: Tab navigation without focus traps.
 * Story 5.2 AC #5, #10: Live queue count, recent activity, wired quick filters.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, Activity, Shield, Filter, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useQueueStats, useRecentActivity } from '../hooks/useAssessor';
import { Lga } from '@oslsr/types';

const LGA_OPTIONS = Object.values(Lga).map(lga => ({
  value: lga,
  label: lga.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
}));

function formatActivityTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function AssessorHome({ isLoading: externalLoading = false }: { isLoading?: boolean }) {
  const navigate = useNavigate();
  const [lgaFilter, setLgaFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const { data: stats, isLoading: statsLoading } = useQueueStats();
  const { data: recentActivity, isLoading: activityLoading } = useRecentActivity();

  const isLoading = externalLoading || statsLoading || activityLoading;

  const handleGoToQueue = () => {
    const params = new URLSearchParams();
    if (lgaFilter) params.set('lgaId', lgaFilter);
    if (severityFilter) params.set('severity', severityFilter);
    const qs = params.toString();
    navigate(qs ? `queue?${qs}` : 'queue');
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Assessor Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Verification queue and audit tools
        </p>
      </div>

      {isLoading ? (
        /* AC8: Skeleton loading branch — mirrors 3-card grid + filters */
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="flex gap-4">
            <div className="h-10 w-40 bg-neutral-200 rounded-md animate-pulse" aria-label="Loading filter" />
            <div className="h-10 w-40 bg-neutral-200 rounded-md animate-pulse" aria-label="Loading filter" />
            <div className="h-10 w-40 bg-neutral-200 rounded-md animate-pulse" aria-label="Loading filter" />
          </div>
        </div>
      ) : (
        <>
          {/* Dashboard Cards — AC1 (3-card grid) */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Verification Queue Card — AC1 + 5.2 AC#5 */}
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={handleGoToQueue}
              role="link"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') handleGoToQueue(); }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <FileSearch className="w-5 h-5 text-amber-600" />
                    </div>
                    <CardTitle className="text-base">Verification Queue</CardTitle>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-neutral-900" data-testid="queue-count">
                    {stats?.totalPending ?? 0}
                  </span>
                  <span className="text-sm text-neutral-500">pending reviews</span>
                </div>
                {stats && (stats.severityBreakdown.high ?? 0) + (stats.severityBreakdown.critical ?? 0) > 0 && (
                  <p className="text-xs text-red-600 mt-1" data-testid="high-severity-count">
                    {(stats.severityBreakdown.high ?? 0) + (stats.severityBreakdown.critical ?? 0)} high/critical severity
                  </p>
                )}
                {stats && stats.reviewedToday > 0 && (
                  <p className="text-xs text-green-600 mt-1" data-testid="reviewed-today">
                    {stats.reviewedToday} reviewed today
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity Card — AC1 + 5.2 AC#10 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {(!recentActivity || recentActivity.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <Activity className="w-8 h-8 text-neutral-300 mb-2" />
                    <p className="text-neutral-500 text-sm">No recent activity</p>
                  </div>
                ) : (
                  <ul className="space-y-2" data-testid="recent-activity-list">
                    {recentActivity.slice(0, 5).map(item => (
                      <li key={item.id} className="flex items-start gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-neutral-700">{formatActionLabel(item.action)}</span>
                          {item.targetId && (
                            <span className="text-neutral-400 ml-1 text-xs">#{item.targetId.slice(0, 8)}</span>
                          )}
                          <p className="text-xs text-neutral-400">{formatActivityTime(item.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Evidence Panel Placeholder — AC2 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Shield className="w-5 h-5 text-red-600" />
                  </div>
                  <CardTitle className="text-base">Evidence Panel</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-neutral-500">GPS clustering</p>
                  <p className="text-sm text-neutral-500">Completion times</p>
                  <p className="text-sm text-neutral-500">Response patterns</p>
                  <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Available in Verification Queue
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Filters — AC1 + 5.2 AC#5 */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-neutral-500" />
              <span className="text-sm font-medium text-neutral-700">Quick Filters</span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="home-lga-filter" className="text-xs text-neutral-500">LGA</label>
                <select
                  id="home-lga-filter"
                  aria-label="Filter by LGA"
                  className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={lgaFilter}
                  onChange={e => setLgaFilter(e.target.value)}
                >
                  <option value="">All LGAs</option>
                  {LGA_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="home-severity-filter" className="text-xs text-neutral-500">Severity</label>
                <select
                  id="home-severity-filter"
                  aria-label="Filter by Severity"
                  className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={severityFilter}
                  onChange={e => setSeverityFilter(e.target.value)}
                >
                  <option value="">All Severities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button
                data-testid="go-to-queue-btn"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
                onClick={handleGoToQueue}
              >
                Go to Queue
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

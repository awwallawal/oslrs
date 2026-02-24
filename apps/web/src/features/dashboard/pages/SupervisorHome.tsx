/**
 * Supervisor Dashboard Home
 *
 * Story 2.5-4 AC1: Supervisor Dashboard Home
 * prep-2: Fully live — Team Overview, Pending Alerts, TodayProgressCard,
 * TotalSubmissionsCard, SubmissionActivityChart, all wired to APIs.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useTeamOverview, usePendingAlerts, supervisorKeys } from '../hooks/useSupervisor';
import { useTeamSubmissionCounts, useDailyCounts, formKeys } from '../../forms/hooks/useForms';
import { useProductivityTargets } from '../hooks/useProductivity';
import { TotalSubmissionsCard } from '../components/TotalSubmissionsCard';
import { TodayProgressCard } from '../components/TodayProgressCard';
import { SubmissionActivityChart } from '../components/SubmissionActivityChart';
import { fillDateGaps, getTodayCount } from '../hooks/useDashboardStats';

export default function SupervisorHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [chartDays, setChartDays] = useState(7);

  // Live data hooks
  const { data: teamOverview, isLoading: teamLoading, error: teamError } = useTeamOverview();
  const { data: alerts, isLoading: alertsLoading, error: alertsError } = usePendingAlerts();
  const { data: teamCounts, isLoading: teamCountsLoading, error: teamCountsError } = useTeamSubmissionCounts();
  const { data: dailyData, isLoading: dailyLoading, error: dailyError } = useDailyCounts(chartDays);
  const { data: targets } = useProductivityTargets();

  const teamTotal = teamCounts ? Object.values(teamCounts).reduce((sum, n) => sum + n, 0) : 0;
  const dailyTarget = targets?.defaultTarget ?? 25;
  const teamTarget = (teamOverview?.total ?? 0) * dailyTarget;
  const filledData = dailyData ? fillDateGaps(dailyData, chartDays) : [];
  const todayCount = getTodayCount(filledData);

  const isLoading = teamLoading || alertsLoading || teamCountsLoading || dailyLoading;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: supervisorKeys.all });
    queryClient.invalidateQueries({ queryKey: formKeys.teamSubmissionCounts() });
    queryClient.invalidateQueries({ queryKey: formKeys.dailyCounts(chartDays) });
    setLastUpdated(new Date());
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Supervisor Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Team management and oversight tools
        </p>
      </div>

      {/* Last Updated + Refresh — AC1 */}
      <div className="flex items-center gap-2 mb-4 text-sm text-neutral-500">
        <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
        <button
          onClick={handleRefresh}
          className="p-1 rounded hover:bg-neutral-100 transition-colors"
          aria-label="Refresh dashboard"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards — Bento Grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard className="h-full lg:col-span-2" />
          <SkeletonCard className="h-full" />
          <SkeletonCard className="h-full" />
          <SkeletonCard className="h-full lg:col-span-2" />
          <SkeletonCard className="col-span-full" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Total Team Submissions — prep-2 (bento: 2:1 ratio) */}
          <TotalSubmissionsCard
            total={teamTotal}
            label="Team Submissions"
            isLoading={teamCountsLoading}
            error={teamCountsError}
            className="h-full lg:col-span-2"
          />

          {/* Today's Progress — prep-2 */}
          <TodayProgressCard
            todayCount={todayCount}
            target={teamTarget}
            label="team submissions today"
            isLoading={dailyLoading}
            error={dailyError}
            className="h-full"
          />

          {/* Team Overview Card — Live (bento: 1:2 ratio) */}
          {!teamError && teamOverview && (
            <Card
              className="h-full cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate('/dashboard/supervisor/team')}
              data-testid="team-overview-card"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <CardTitle className="text-base">Team Overview</CardTitle>
                  </div>
                  <ChevronRight className="w-5 h-5 text-neutral-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-neutral-900" data-testid="team-total">{teamOverview.total}</span>
                    <span className="text-sm text-neutral-500">enumerators</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-neutral-600" data-testid="team-active">{teamOverview.active} active</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-neutral-400 rounded-full" />
                      <span className="text-neutral-600" data-testid="team-inactive">{teamOverview.inactive} inactive</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending Alerts Card — Live */}
          {!alertsError && alerts && (
            <Card data-testid="pending-alerts-card" className="h-full lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <CardTitle className="text-base">Pending Alerts</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {alerts.totalAlerts === 0 ? (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <p className="text-neutral-500 text-sm" data-testid="alerts-clear">All clear</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.unprocessedCount > 0 && (
                      <p className="text-sm text-neutral-700" data-testid="unprocessed-count">
                        <strong>{alerts.unprocessedCount}</strong> unprocessed submissions
                      </p>
                    )}
                    {alerts.failedCount > 0 && (
                      <p className="text-sm text-red-600" data-testid="failed-count">
                        <strong>{alerts.failedCount}</strong> failed submissions
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submission Activity Chart — prep-2 */}
          <SubmissionActivityChart
            data={filledData}
            target={teamTarget}
            days={chartDays}
            onDaysChange={setChartDays}
            isLoading={dailyLoading}
            error={dailyError}
            roleLabel="Team"
            className="col-span-full"
          />
        </div>
      )}
    </div>
  );
}

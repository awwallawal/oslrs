/**
 * Official Trends Page
 *
 * Story 5.1 AC4: Registration trends bar chart with 7-day/30-day toggle.
 * Reuses SubmissionActivityChart pattern from Supervisor dashboard.
 * Direction 08 styling with skeleton loading.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useRegistrationTrends } from '../hooks/useOfficial';
import { fillDateGaps, computeSummary } from '../hooks/useDashboardStats';
import { SubmissionActivityChart } from '../components/SubmissionActivityChart';
import type { DailyCount } from '../../forms/api/submission.api';

export default function OfficialTrendsPage() {
  const [days, setDays] = useState<number>(7);
  const { data: trends, isLoading: trendsLoading, error: trendsError } = useRegistrationTrends(days);

  // Map API response to DailyCount format and fill gaps
  const chartData: DailyCount[] = useMemo(() => {
    if (!trends) return [];
    const mapped = trends.map((t) => ({ date: t.date, count: t.count }));
    return fillDateGaps(mapped, days);
  }, [trends, days]);

  const summary = useMemo(() => computeSummary(chartData), [chartData]);

  return (
    <div className="p-6">
      {/* Direction 08: Dark header accent strip */}
      <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-2xl font-brand font-semibold">Trend Analysis</h1>
        <p className="text-gray-300 mt-1">
          Registration trends and period comparisons
        </p>
      </div>

      {trendsLoading ? (
        <>
          <div className="border-l-4 border-gray-200 pl-4 mb-6">
            <div className="h-6 w-40 bg-neutral-200 rounded animate-pulse" />
          </div>
          <SkeletonCard />
          <div className="grid gap-6 md:grid-cols-3 mt-6">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      ) : (
        <>
          {/* Registration Trends Chart — AC4 */}
          <div className="border-l-4 border-[#9C1E23] pl-4 mb-6">
            <h2 className="text-lg font-brand font-semibold text-gray-800">Registration Trends</h2>
          </div>

          <SubmissionActivityChart
            data={chartData}
            target={0}
            days={days}
            onDaysChange={setDays}
            isLoading={false}
            error={trendsError}
            roleLabel="Registration"
          />

          {/* Trend Indicators */}
          <div className="border-l-4 border-[#9C1E23] pl-4 mb-6 mt-8">
            <h2 className="text-lg font-brand font-semibold text-gray-800">Period Summary</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3" data-testid="trend-summary">
            <Card>
              <CardContent className="pt-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Average / Day</p>
                  <p className="text-2xl font-bold text-gray-800" data-testid="trend-avg">{summary.avg}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Best Day</p>
                  <p className="text-2xl font-bold text-gray-800" data-testid="trend-best">{summary.best}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Total ({days} days)</p>
                  <p className="text-2xl font-bold text-gray-800" data-testid="trend-total">{summary.total}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

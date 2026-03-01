/**
 * Government Official Dashboard Home — Direction 08 Styling
 *
 * Story 5.1: High-Level Policy Dashboard
 * AC1: Real-time registration counts, today's registrations, LGAs covered, source breakdown.
 * AC5: Skeleton screens matching content shape.
 * AC6: All data strictly read-only.
 * AC7: Direction 08 styling maintained throughout.
 */

import { useNavigate } from 'react-router-dom';
import { TrendingUp, Download, Users, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useOverviewStats } from '../hooks/useOfficial';

const TARGET = 1_000_000;

export default function OfficialHome() {
  const navigate = useNavigate();
  const { data: stats, isLoading, error } = useOverviewStats();

  const totalRespondents = stats?.totalRespondents ?? 0;
  const todayCount = stats?.todayRegistrations ?? 0;
  const yesterdayCount = stats?.yesterdayRegistrations ?? 0;
  const lgasCovered = stats?.lgasCovered ?? 0;
  const sourceBreakdown = stats?.sourceBreakdown ?? { enumerator: 0, public: 0, clerk: 0 };

  // Delta: today vs yesterday
  const delta = todayCount - yesterdayCount;
  const progressPct = Math.min(100, (totalRespondents / TARGET) * 100);

  return (
    <div className="p-6">
      {/* Direction 08: Dark header accent strip */}
      <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-2xl font-brand font-semibold">
          Reports Dashboard
        </h1>
        <p className="text-gray-300 mt-1">
          State-level overview and policy reporting
        </p>
      </div>

      {isLoading ? (
        /* Skeleton loading branch — mirrors section header + 3-card + source grid */
        <>
          <div className="border-l-4 border-gray-200 pl-4 mb-6">
            <div className="h-6 w-24 bg-neutral-200 rounded animate-pulse" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="mt-6 border-l-4 border-gray-200 pl-4 mb-6">
            <div className="h-6 w-36 bg-neutral-200 rounded animate-pulse" />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      ) : error ? (
        <div data-testid="error-state" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-medium mb-1">Unable to load dashboard data</p>
          <p className="text-red-600 text-sm">Please check your connection and try refreshing the page.</p>
        </div>
      ) : (
        <>
          {/* Direction 08: Section header with left maroon border */}
          <div className="border-l-4 border-[#9C1E23] pl-4 mb-6">
            <h2 className="text-lg font-brand font-semibold text-gray-800">Overview</h2>
          </div>

          {/* Dashboard Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* State Overview Card — AC1 */}
            <Card data-testid="state-overview-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Users className="w-5 h-5 text-slate-600" />
                  </div>
                  <CardTitle className="text-base">State Overview</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div data-testid="overview-stats" className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-gray-800" data-testid="total-respondents">
                      {totalRespondents.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">total respondents</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Today</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800" data-testid="today-count">
                          {todayCount.toLocaleString()}
                        </span>
                        {delta !== 0 && (
                          <span
                            data-testid="delta-indicator"
                            className={`flex items-center text-xs ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}
                          >
                            {delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                            {Math.abs(delta)}
                          </span>
                        )}
                        {delta === 0 && yesterdayCount > 0 && (
                          <span className="flex items-center text-xs text-gray-400" data-testid="delta-indicator">
                            <Minus className="w-3 h-3" /> 0
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">LGAs Covered</span>
                      <span className="text-sm font-medium text-gray-800" data-testid="lgas-covered">
                        {lgasCovered} / 33
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Collection Progress Card — AC1 */}
            <Card data-testid="collection-progress-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <CardTitle className="text-base">Collection Progress</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div data-testid="progress-stats" className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-gray-800" data-testid="progress-count">
                        {totalRespondents.toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-500">/ {TARGET.toLocaleString()} target</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        data-testid="progress-bar"
                        className={`h-2 rounded-full transition-all ${progressPct >= 100 ? 'bg-emerald-500' : 'bg-[#9C1E23]'}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">{progressPct.toFixed(1)}% complete</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export Data Card — placeholder for Story 5.4 */}
            <Card data-testid="export-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Download className="w-5 h-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-base">Export Data</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div data-testid="export-group" className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                  <p className="text-sm text-gray-600 mb-3">
                    Download reports in CSV or PDF format.
                  </p>
                  <button
                    onClick={() => navigate('/dashboard/official/export')}
                    className="w-full px-4 py-2 bg-[#9C1E23] hover:bg-[#7A171B] text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Export Report
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Source Channel Breakdown — AC1 */}
          <div className="border-l-4 border-[#9C1E23] pl-4 mb-6 mt-8">
            <h2 className="text-lg font-brand font-semibold text-gray-800">Source Channels</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3" data-testid="source-breakdown">
            <Card>
              <CardContent className="pt-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Enumerator</p>
                  <p className="text-2xl font-bold text-gray-800" data-testid="source-enumerator">
                    {sourceBreakdown.enumerator.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Public</p>
                  <p className="text-2xl font-bold text-gray-800" data-testid="source-public">
                    {sourceBreakdown.public.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Data Entry Clerk</p>
                  <p className="text-2xl font-bold text-gray-800" data-testid="source-clerk">
                    {sourceBreakdown.clerk.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

    </div>
  );
}

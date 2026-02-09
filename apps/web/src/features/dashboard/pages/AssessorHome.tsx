/**
 * Verification Assessor Dashboard Home
 *
 * Story 2.5-7 AC1: Audit-focused dashboard with Verification Queue, Recent Activity,
 * Evidence Panel placeholder, and Quick Filters.
 * Story 2.5-7 AC2: Evidence display placeholder for GPS clustering, completion times,
 * response patterns (Epic 5 wiring).
 * Story 2.5-7 AC8: SkeletonCard loading branch.
 * Story 2.5-7 AC10: Tab navigation without focus traps.
 */

import { FileSearch, Activity, Shield, Filter } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';

export default function AssessorHome({ isLoading = false }: { isLoading?: boolean }) {
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
            {/* Verification Queue Card — AC1 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <FileSearch className="w-5 h-5 text-amber-600" />
                  </div>
                  <CardTitle className="text-base">Verification Queue</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-neutral-900">0</span>
                  <span className="text-sm text-neutral-500">pending reviews</span>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity Card — AC1 */}
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
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Activity className="w-8 h-8 text-neutral-300 mb-2" />
                  <p className="text-neutral-500 text-sm">No recent activity</p>
                </div>
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
                  <span className="inline-block mt-2 px-2 py-1 bg-neutral-100 text-neutral-500 text-xs rounded-full">
                    Coming in Epic 5
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Filters — AC1 */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-neutral-500" />
              <span className="text-sm font-medium text-neutral-700">Quick Filters</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <select
                disabled
                aria-label="Filter by LGA"
                className="bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              >
                <option>Filter by LGA</option>
              </select>
              <select
                disabled
                aria-label="Filter by Enumerator"
                className="bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              >
                <option>Filter by Enumerator</option>
              </select>
              <select
                disabled
                aria-label="Filter by Date Range"
                className="bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              >
                <option>Filter by Date Range</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

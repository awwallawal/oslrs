/**
 * Supervisor Dashboard Home
 *
 * Story 2.5-4 AC1: Supervisor Dashboard Home
 * - Team Overview card (placeholder count)
 * - Pending Alerts card (empty state)
 * - Today's Collection card (placeholder)
 * - Last Updated timestamp with refresh button
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, AlertTriangle, ChevronRight, RefreshCw, ClipboardList } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';

export default function SupervisorHome() {
  const navigate = useNavigate();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // No API hook yet — hardcoded for skeleton branch to exist in JSX (Epic 4 will swap)
  const isLoading = false;

  const handleRefresh = () => {
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

      {/* Summary Cards Grid — AC1 */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Team Overview Card — AC1 */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/dashboard/supervisor/team')}
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
                  <span className="text-3xl font-semibold text-neutral-900">0</span>
                  <span className="text-sm text-neutral-500">enumerators</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-neutral-600">0 active</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-neutral-400 rounded-full" />
                    <span className="text-neutral-600">0 inactive</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Alerts Card — AC1 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <CardTitle className="text-base">Pending Alerts</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <p className="text-neutral-500 text-sm">No alerts yet</p>
              </div>
            </CardContent>
          </Card>

          {/* Today's Collection Card — AC1 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <ClipboardList className="w-5 h-5 text-emerald-600" />
                </div>
                <CardTitle className="text-base">Today's Collection</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-neutral-900">0</span>
                  <span className="text-sm text-neutral-500">submissions</span>
                </div>
                <p className="text-sm text-neutral-400 italic">Coming in Epic 3</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

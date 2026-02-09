/**
 * Government Official Dashboard Home — Direction 08 Styling
 *
 * Story 2.5-7 AC3: Read-only Reports Dashboard with State Overview,
 * Collection Progress, Export Data cards.
 * Story 2.5-7 AC4: ALL elements read-only (no edit/action buttons except Export).
 * Story 2.5-7 AC5: Direction 08 formal government styling.
 * Story 2.5-7 AC8: SkeletonCard loading branch.
 * Story 2.5-7 AC10: Tab navigation without focus traps.
 */

import { useState } from 'react';
import { PieChart, TrendingUp, Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
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

export default function OfficialHome({ isLoading = false }: { isLoading?: boolean }) {
  const [showExportModal, setShowExportModal] = useState(false);

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
        /* AC8: Skeleton loading branch — mirrors section header + 3-card grid */
        <>
          <div className="border-l-4 border-gray-200 pl-4 mb-6">
            <div className="h-6 w-24 bg-neutral-200 rounded animate-pulse" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      ) : (
        <>
          {/* Direction 08: Section header with left maroon border */}
          <div className="border-l-4 border-[#9C1E23] pl-4 mb-6">
            <h2 className="text-lg font-brand font-semibold text-gray-800">Overview</h2>
          </div>

          {/* Dashboard Cards — AC3 (3-card grid) */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* State Overview Card — AC3 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <PieChart className="w-5 h-5 text-slate-600" />
                  </div>
                  <CardTitle className="text-base">State Overview</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* Direction 08: Field group with bg-gray-50 */}
                <div data-testid="field-group" className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Registrations</span>
                      <span className="text-sm font-medium text-gray-800">—</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Active Surveys</span>
                      <span className="text-sm font-medium text-gray-800">—</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">LGAs Covered</span>
                      <span className="text-sm font-medium text-gray-800">—</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Collection Progress Card — AC3 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <CardTitle className="text-base">Collection Progress</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* Direction 08: Field group */}
                <div data-testid="field-group" className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-gray-800">0</span>
                      <span className="text-sm text-gray-500">/ 1,000,000 target</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: '0%' }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export Data Card — AC3, AC4 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Download className="w-5 h-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-base">Export Data</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* Direction 08: Field group */}
                <div data-testid="field-group" className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                  <p className="text-sm text-gray-600 mb-3">
                    Download reports in CSV or PDF format.
                  </p>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="w-full px-4 py-2 bg-[#9C1E23] hover:bg-[#7A171B] text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Export Report
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Coming in Epic 5 Modal — AC3 (Export) */}
      <AlertDialog open={showExportModal} onOpenChange={setShowExportModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Coming in Epic 5</AlertDialogTitle>
            <AlertDialogDescription>
              The export functionality is being developed as part of Epic 5 —
              Back-Office Audit & Policy Reporting. You will be able to generate
              CSV and PDF reports for state-level analysis.
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

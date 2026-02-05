/**
 * Super Admin Dashboard Home
 *
 * Story 2.5-2: Dashboard landing page with summary cards for:
 * - Questionnaire Management (total forms, published, drafts)
 * - Staff Management
 * - Quick Stats (system overview)
 *
 * @see AC1: Super Admin Dashboard Home with Summary Cards
 * @see AC5: Card-Based Layout with Skeleton Loading
 */

import { useNavigate } from 'react-router-dom';
import { FileText, Users, Activity, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useQuestionnaires } from '../../questionnaires/hooks/useQuestionnaires';

export default function SuperAdminHome() {
  const navigate = useNavigate();

  // Fetch questionnaire summary
  const { data: questionnairesData, isLoading } = useQuestionnaires();

  // Calculate questionnaire stats
  const questionnaires = questionnairesData?.data ?? [];
  const totalForms = questionnairesData?.meta?.total ?? 0;
  const publishedCount = questionnaires.filter((q) => q.status === 'published').length;
  const draftCount = questionnaires.filter((q) => q.status === 'draft').length;

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Super Admin Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          System overview and management tools
        </p>
      </div>

      {/* Summary Cards Grid - AC5 */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Questionnaire Management Card - AC1 */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/dashboard/super-admin/questionnaires')}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <CardTitle className="text-base">Questionnaires</CardTitle>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-neutral-900">{totalForms}</span>
                  <span className="text-sm text-neutral-500">total forms</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-neutral-600">{publishedCount} published</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-neutral-400 rounded-full" />
                    <span className="text-neutral-600">{draftCount} drafts</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Staff Management Card - AC1 */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/dashboard/super-admin/staff')}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Users className="w-5 h-5 text-emerald-600" />
                  </div>
                  <CardTitle className="text-base">Staff Management</CardTitle>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-600 text-sm">
                    Manage supervisors, enumerators, and other staff members
                  </span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-primary-600 font-medium">View Staff</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats Card - AC1 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
                <CardTitle className="text-base">Quick Stats</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Active Forms</span>
                  <span className="font-medium text-neutral-900">{publishedCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Submissions</span>
                  <span className="text-neutral-400 italic">Coming soon</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-neutral-500">System Status</span>
                  <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                    Online
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

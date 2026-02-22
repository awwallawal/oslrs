/**
 * RespondentDetailSkeleton — A2 compliant content-shaped skeleton
 *
 * Story 5.3: Individual Record PII View.
 * Matches the shape of the actual RespondentDetailPage content:
 * header bar + 2 info cards + submission history table.
 */

import { SkeletonText, SkeletonCard, SkeletonTable } from '../../../components/skeletons';

export function RespondentDetailSkeleton() {
  return (
    <div className="p-6 space-y-6" data-testid="respondent-detail-skeleton">
      {/* Header skeleton: back button + title */}
      <div className="flex items-center gap-4">
        <div className="h-9 w-20 bg-neutral-200 rounded animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-7 w-64 bg-neutral-200 rounded animate-pulse" />
          <div className="h-4 w-48 bg-neutral-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Info cards row */}
      <div className="grid gap-6 md:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Fraud summary card */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <SkeletonText width="sm" />
        <div className="mt-3 flex gap-6">
          <div className="h-8 w-24 bg-neutral-200 rounded animate-pulse" />
          <div className="h-8 w-24 bg-neutral-200 rounded animate-pulse" />
          <div className="h-8 w-24 bg-neutral-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Submission history table skeleton */}
      <SkeletonTable rows={5} columns={7} />
    </div>
  );
}

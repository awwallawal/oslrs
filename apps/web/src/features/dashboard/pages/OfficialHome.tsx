/**
 * Government Official Dashboard Home
 *
 * Story 2.5-1: Placeholder for Official dashboard landing page.
 * Full implementation in Story 2.5-7.
 */

import { SkeletonCard } from '../../../components/skeletons';

export default function OfficialHome() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Official Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Statistics and policy reporting tools
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <div className="mt-6">
        <p className="text-sm text-neutral-500">
          Dashboard features will be implemented in subsequent stories.
        </p>
      </div>
    </div>
  );
}

/**
 * Data Entry Clerk Dashboard Home
 *
 * Story 2.5-1: Placeholder for Clerk dashboard landing page.
 * Full implementation in Story 2.5-6.
 */

import { SkeletonCard } from '../../../components/skeletons';

export default function ClerkHome() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Data Entry Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Data entry queue and completed entries
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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

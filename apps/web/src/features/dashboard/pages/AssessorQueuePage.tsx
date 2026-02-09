/**
 * Assessor Verification Queue Page (Placeholder)
 *
 * Story 2.5-7 AC9: Empty state placeholder for verification queue.
 * Full implementation in Epic 5.
 */

import { FileSearch } from 'lucide-react';

export default function AssessorQueuePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-brand font-semibold text-neutral-900 mb-6">Verification Queue</h1>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileSearch className="w-12 h-12 text-neutral-300 mb-4" />
        <h2 className="text-lg font-medium text-neutral-600 mb-2">Nothing here yet</h2>
        <p className="text-neutral-500 text-sm max-w-md">Verification queue will be available in Epic 5.</p>
      </div>
    </div>
  );
}

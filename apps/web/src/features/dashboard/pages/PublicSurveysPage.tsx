/**
 * Public User Surveys Page (Placeholder)
 *
 * Story 2.5-8 AC3: Survey Status sub-page with empty state.
 * Full survey functionality in Epic 3.
 */

import { ClipboardList } from 'lucide-react';

export default function PublicSurveysPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-brand font-semibold text-neutral-900 mb-6">Survey Status</h1>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList className="w-12 h-12 text-neutral-300 mb-4" />
        <h2 className="text-lg font-medium text-neutral-600 mb-2">No surveys yet</h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Your survey history will appear here once you complete your first survey. Coming in Epic 3.
        </p>
      </div>
    </div>
  );
}

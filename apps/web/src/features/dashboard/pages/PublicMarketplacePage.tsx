/**
 * Public User Marketplace Page (Placeholder)
 *
 * Story 2.5-8 AC3: Marketplace sub-page with empty state.
 * Full marketplace opt-in in Epic 7.
 */

import { Briefcase } from 'lucide-react';

export default function PublicMarketplacePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-brand font-semibold text-neutral-900 mb-6">Marketplace</h1>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Briefcase className="w-12 h-12 text-neutral-300 mb-4" />
        <h2 className="text-lg font-medium text-neutral-600 mb-2">Not yet available</h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Marketplace opt-in and profile management coming in Epic 7.
        </p>
      </div>
    </div>
  );
}

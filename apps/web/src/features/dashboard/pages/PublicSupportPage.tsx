/**
 * Public User Support Page (Placeholder)
 *
 * Story 2.5-8 AC3: Support sub-page with empty state.
 */

import { HelpCircle } from 'lucide-react';

export default function PublicSupportPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-brand font-semibold text-neutral-900 mb-6">Support</h1>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HelpCircle className="w-12 h-12 text-neutral-300 mb-4" />
        <h2 className="text-lg font-medium text-neutral-600 mb-2">Support resources</h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Support resources and FAQs will be available here.
        </p>
      </div>
    </div>
  );
}

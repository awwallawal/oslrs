/**
 * Official Export Page (Placeholder)
 *
 * Story 2.5-7 AC9: Empty state placeholder for export functionality.
 * Full implementation in Epic 5.
 */

import { Download } from 'lucide-react';

export default function OfficialExportPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-brand font-semibold text-neutral-900 mb-6">Export Reports</h1>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Download className="w-12 h-12 text-neutral-300 mb-4" />
        <h2 className="text-lg font-medium text-neutral-600 mb-2">Nothing here yet</h2>
        <p className="text-neutral-500 text-sm max-w-md">Export functionality will be available in Epic 5.</p>
      </div>
    </div>
  );
}

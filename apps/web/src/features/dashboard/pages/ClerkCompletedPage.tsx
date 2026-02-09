/**
 * Clerk Completed Entries Page (Placeholder)
 *
 * Story 2.5-6 AC7: Empty state placeholder for completed entries.
 * Full implementation in Epic 3.
 */

import { CheckSquare } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function ClerkCompletedPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Completed Entries</h1>
        <p className="text-neutral-600 mt-1">Successfully submitted forms</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CheckSquare className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No completed entries yet</p>
          <p className="text-sm text-neutral-400 mt-1">Submitted forms will appear here</p>
        </CardContent>
      </Card>
    </div>
  );
}

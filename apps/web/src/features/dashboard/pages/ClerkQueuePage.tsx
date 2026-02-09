/**
 * Clerk Entry Queue Page (Placeholder)
 *
 * Story 2.5-6 AC7: Empty state placeholder for entry queue.
 * Full implementation in Epic 3.
 */

import { ListOrdered } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function ClerkQueuePage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Entry Queue</h1>
        <p className="text-neutral-600 mt-1">Forms awaiting digitization</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <ListOrdered className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No pending entries</p>
          <p className="text-sm text-neutral-400 mt-1">Forms will appear here when assigned</p>
        </CardContent>
      </Card>
    </div>
  );
}

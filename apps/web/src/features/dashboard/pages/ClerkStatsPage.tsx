/**
 * Clerk Performance Stats Page (Placeholder)
 *
 * Story 2.5-6 AC7: Empty state placeholder for performance stats.
 * Full implementation in future stories.
 */

import { BarChart } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function ClerkStatsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">My Performance Stats</h1>
        <p className="text-neutral-600 mt-1">Track your data entry productivity</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No stats available yet</p>
          <p className="text-sm text-neutral-400 mt-1">Stats will populate as you complete entries</p>
        </CardContent>
      </Card>
    </div>
  );
}

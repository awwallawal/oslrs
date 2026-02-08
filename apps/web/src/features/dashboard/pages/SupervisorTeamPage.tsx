/**
 * Supervisor Team Page
 *
 * Story 2.5-4 AC2: Team Overview Detail
 * Placeholder page — real team data comes in Epic 4.
 */

import { Users } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function SupervisorTeamPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Team Progress</h1>
        <p className="text-neutral-600 mt-1">Monitor your assigned enumerators</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No enumerators assigned yet</p>
          <p className="text-sm text-neutral-400 mt-1">
            Team assignments will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

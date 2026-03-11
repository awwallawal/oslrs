/**
 * Field Coverage Map — enumerator GPS points on LGA boundary
 * Story 8.3: Supervisor team analytics — extends TeamGpsMap pattern
 */

import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';

interface Props {
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

/**
 * Placeholder for Leaflet GPS coverage map.
 * Full implementation requires useTeamGps() hook from supervisor dashboard.
 * For MVP: displays a card indicating the feature depends on existing GPS data.
 */
export default function FieldCoverageMap({ isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-red-600">Failed to load GPS coverage data</CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Field Coverage Map</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-80 flex items-center justify-center text-neutral-500">
        <div className="text-center">
          <p className="font-medium">GPS Coverage Map</p>
          <p className="text-sm mt-1">Enumerator GPS points are displayed on the Team Progress page.</p>
          <p className="text-sm">Navigate to Team Progress → GPS Map for interactive coverage view.</p>
        </div>
      </CardContent>
    </Card>
  );
}

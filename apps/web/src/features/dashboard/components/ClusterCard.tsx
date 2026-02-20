import { MapPin, Clock, Users, Eye } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { FraudSeverityBadge } from './FraudSeverityBadge';
import type { FraudClusterSummary } from '../api/fraud.api';

interface ClusterCardProps {
  cluster: FraudClusterSummary;
  onViewCluster: (cluster: FraudClusterSummary) => void;
}

function formatTimeRange(earliest: string | null, latest: string | null): string {
  if (!earliest || !latest) return 'Unknown';
  const start = new Date(earliest);
  const end = new Date(latest);
  const dateStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const startTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr}, ${startTime} - ${endTime}`;
}

/**
 * ClusterCard — displays a GPS cluster summary for bulk verification.
 * Story 4.5 AC4.5.1: cluster cards with location, count, time range, severity, enumerators.
 */
export function ClusterCard({ cluster, onViewCluster }: ClusterCardProps) {
  return (
    <Card data-testid={`cluster-card-${cluster.clusterId}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header: Location + Count */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-neutral-500 shrink-0" />
            <span className="text-sm font-medium">
              {cluster.center.lat.toFixed(4)}, {cluster.center.lng.toFixed(4)}
            </span>
          </div>
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            {cluster.detectionCount} alerts
          </span>
        </div>

        {/* Time range */}
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatTimeRange(cluster.timeRange.earliest, cluster.timeRange.latest)}</span>
        </div>

        {/* Severity range */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Severity:</span>
          <FraudSeverityBadge severity={cluster.severityRange.min} />
          {cluster.severityRange.min !== cluster.severityRange.max && (
            <>
              <span className="text-xs text-neutral-400">to</span>
              <FraudSeverityBadge severity={cluster.severityRange.max} />
            </>
          )}
        </div>

        {/* Enumerators */}
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {cluster.enumerators.map(e => e.name).join(', ')}
          </span>
        </div>

        {/* Avg score */}
        <div className="text-xs text-neutral-500">
          Avg score: <span className="font-mono font-medium">{cluster.totalScoreAvg.toFixed(1)}</span>
        </div>

        {/* Action */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onViewCluster(cluster)}
          data-testid={`view-cluster-${cluster.clusterId}`}
        >
          <Eye className="h-4 w-4 mr-1.5" />
          View Cluster
        </Button>
      </CardContent>
    </Card>
  );
}

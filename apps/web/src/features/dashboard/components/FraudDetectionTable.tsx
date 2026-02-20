/**
 * FraudDetectionTable Component
 * Story 4.4 AC4.4.1: Table showing flagged submissions with severity badges and actions.
 */

import { Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { FraudSeverityBadge } from './FraudSeverityBadge';
import { FraudResolutionBadge } from './FraudResolutionBadge';
import type { FraudDetectionListItem } from '../api/fraud.api';

interface FraudDetectionTableProps {
  detections: FraudDetectionListItem[];
  selectedId?: string | null;
  onSelectDetection: (id: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function FraudDetectionTable({ detections, selectedId, onSelectDetection }: FraudDetectionTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" role="table">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            <th className="py-3 px-4 font-medium text-neutral-600">Enumerator</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Submitted</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Score</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Severity</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Status</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {detections.map((detection) => (
            <tr
              key={detection.id}
              className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${
                selectedId === detection.id ? 'bg-neutral-100' : ''
              }`}
              onClick={() => onSelectDetection(detection.id)}
              role="row"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectDetection(detection.id);
              }}
            >
              <td className="py-3 px-4 text-neutral-900 font-medium">
                {detection.enumeratorName}
              </td>
              <td className="py-3 px-4 text-neutral-600">
                {formatDate(detection.submittedAt)}
              </td>
              <td className="py-3 px-4 text-neutral-900 font-mono">
                {detection.totalScore.toFixed(1)}
              </td>
              <td className="py-3 px-4">
                <FraudSeverityBadge severity={detection.severity} />
              </td>
              <td className="py-3 px-4">
                <FraudResolutionBadge resolution={detection.resolution} />
              </td>
              <td className="py-3 px-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDetection(detection.id);
                  }}
                  aria-label={`View evidence for ${detection.enumeratorName}`}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Evidence
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

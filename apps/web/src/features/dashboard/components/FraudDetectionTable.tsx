/**
 * FraudDetectionTable Component
 * Story 4.4 AC4.4.1: Table showing flagged submissions with severity badges and actions.
 * Story 4.5 AC4.5.2: Extended with checkbox column for multi-select and verified animation.
 */

import { Eye, CheckSquare, Square, CheckCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { FraudSeverityBadge } from './FraudSeverityBadge';
import { FraudResolutionBadge } from './FraudResolutionBadge';
import type { FraudDetectionListItem } from '../api/fraud.api';

interface FraudDetectionTableProps {
  detections: (FraudDetectionListItem & { lgaId?: string | null })[];
  selectedId?: string | null;
  onSelectDetection: (id: string) => void;
  // Story 4.5: Multi-select props (optional for backwards compatibility)
  multiSelect?: boolean;
  isItemSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  allSelected?: boolean;
  verifiedIds?: Set<string>;
  // Story 5.2: Optional columns for assessor queue
  showLgaColumn?: boolean;
  showSupervisorResolutionColumn?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function FraudDetectionTable({
  detections,
  selectedId,
  onSelectDetection,
  multiSelect = false,
  isItemSelected,
  onToggleSelect,
  onSelectAll,
  allSelected = false,
  verifiedIds,
  showLgaColumn = false,
  showSupervisorResolutionColumn = false,
}: FraudDetectionTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" role="table">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            {multiSelect && (
              <th className="py-3 px-3 w-10">
                <button
                  onClick={onSelectAll}
                  className="flex items-center justify-center"
                  aria-label={allSelected ? 'Deselect all' : 'Select all unreviewed'}
                  data-testid="select-all-checkbox"
                >
                  {allSelected
                    ? <CheckSquare className="h-4 w-4 text-green-600" />
                    : <Square className="h-4 w-4 text-neutral-400" />
                  }
                </button>
              </th>
            )}
            <th className="py-3 px-4 font-medium text-neutral-600">Enumerator</th>
            {showLgaColumn && <th className="py-3 px-4 font-medium text-neutral-600">LGA</th>}
            <th className="py-3 px-4 font-medium text-neutral-600">Submitted</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Score</th>
            <th className="py-3 px-4 font-medium text-neutral-600">Severity</th>
            {showSupervisorResolutionColumn && <th className="py-3 px-4 font-medium text-neutral-600">Supervisor</th>}
            {!showSupervisorResolutionColumn && <th className="py-3 px-4 font-medium text-neutral-600">Status</th>}
            <th className="py-3 px-4 font-medium text-neutral-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {detections.map((detection, index) => {
            const isVerified = verifiedIds?.has(detection.id) ?? false;
            const isChecked = isItemSelected?.(detection.id) ?? false;

            return (
              <tr
                key={detection.id}
                className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors duration-400 ${
                  selectedId === detection.id ? 'bg-neutral-100' : ''
                } ${isVerified ? 'bg-green-50' : ''}`}
                style={isVerified ? { transitionDelay: `${index * 300}ms` } : undefined}
                onClick={() => onSelectDetection(detection.id)}
                role="row"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectDetection(detection.id);
                }}
                data-testid={`fraud-row-${detection.id}`}
              >
                {multiSelect && (
                  <td className="py-3 px-3">
                    {detection.resolution === null ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(detection.id); }}
                        className="flex items-center justify-center"
                        aria-label={isChecked ? `Deselect ${detection.enumeratorName}` : `Select ${detection.enumeratorName}`}
                        data-testid={`checkbox-${detection.id}`}
                      >
                        {isChecked
                          ? <CheckSquare className="h-4 w-4 text-green-600" />
                          : <Square className="h-4 w-4 text-neutral-400" />
                        }
                      </button>
                    ) : (
                      <span className="flex items-center justify-center">
                        {isVerified
                          ? <CheckCircle className="h-4 w-4 text-green-500" />
                          : <span className="w-4" />
                        }
                      </span>
                    )}
                  </td>
                )}
                <td className="py-3 px-4 text-neutral-900 font-medium">
                  {isVerified && <CheckCircle className="h-4 w-4 text-green-500 inline mr-1.5" />}
                  {detection.enumeratorName}
                </td>
                {showLgaColumn && (
                  <td className="py-3 px-4 text-neutral-600 text-xs">
                    {('lgaId' in detection && detection.lgaId) ? String(detection.lgaId).replace(/_/g, ' ') : '—'}
                  </td>
                )}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

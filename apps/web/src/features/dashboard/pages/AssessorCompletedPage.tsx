/**
 * Assessor Completed Reviews Page
 *
 * Story 5.2 AC #6: Table of all fraud detections where assessorResolution IS NOT NULL.
 * Shows supervisor resolution alongside assessor final decision, sorted by assessorReviewedAt DESC.
 */

import { useState, useEffect } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, AlertTriangle, Eye } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { SkeletonTable, SkeletonCard } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { FraudSeverityBadge } from '../components/FraudSeverityBadge';
import { FraudResolutionBadge } from '../components/FraudResolutionBadge';
import { EvidencePanel } from '../components/EvidencePanel';
import { useCompletedReviews } from '../hooks/useAssessor';
import { useFraudDetectionDetail } from '../hooks/useFraudDetections';
import type { CompletedFilters } from '../api/assessor.api';

const DECISION_OPTIONS = [
  { value: '', label: 'All Decisions' },
  { value: 'final_approved', label: 'Approved' },
  { value: 'final_rejected', label: 'Rejected' },
] as const;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AssessorDecisionBadge({ decision }: { decision: string }) {
  if (decision === 'final_approved') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
        Final Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      Final Rejected
    </span>
  );
}

export default function AssessorCompletedPage() {
  const [decisionFilter, setDecisionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);

  const filters: CompletedFilters = {
    assessorDecision: decisionFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    severity: severityFilter.length > 0 ? severityFilter : undefined,
    page,
    pageSize: 20,
  };

  const { data: completedData, isLoading, isError } = useCompletedReviews(filters);
  const { data: detectionDetail, isLoading: isDetailLoading } = useFraudDetectionDetail(selectedDetectionId);

  // Escape key closes detail view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDetectionId) {
        setSelectedDetectionId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDetectionId]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Completed Reviews</h1>
        <p className="text-neutral-600 mt-1">History of all assessor final decisions</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-4" data-testid="completed-filter-bar">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Decision</label>
          <select
            data-testid="decision-filter"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={decisionFilter}
            onChange={e => { setDecisionFilter(e.target.value); setPage(1); }}
          >
            {DECISION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Date From</label>
          <input
            type="date"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Date To</label>
          <input
            type="date"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Severity</label>
          <div className="flex gap-1">
            {(['high', 'critical', 'medium', 'low'] as const).map(sv => (
              <button
                key={sv}
                onClick={() => {
                  setSeverityFilter(prev => prev.includes(sv) ? prev.filter(s => s !== sv) : [...prev, sv]);
                  setPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  severityFilter.includes(sv)
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
                }`}
              >
                {sv.charAt(0).toUpperCase() + sv.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-6">
        <div className={`${selectedDetectionId ? 'w-1/2' : 'w-full'} transition-all`}>
          <Card>
            <CardContent className="p-0">
              {isLoading && (
                <div className="p-4" aria-busy="true" aria-label="Loading completed reviews">
                  <SkeletonTable rows={5} columns={10} />
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="w-12 h-12 text-red-300 mb-4" />
                  <p className="text-red-600 font-medium">Failed to load completed reviews</p>
                </div>
              )}

              {!isLoading && !isError && completedData && completedData.data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
                  <CheckCircle className="w-12 h-12 text-neutral-300 mb-4" />
                  <p className="text-neutral-500 font-medium">No completed reviews</p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Reviews you complete will appear here.
                  </p>
                </div>
              )}

              {!isLoading && !isError && completedData && completedData.data.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" role="table">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left">
                          <th className="py-3 px-4 font-medium text-neutral-600">Enumerator</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">LGA</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Submitted</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Score</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Severity</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Supervisor</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Assessor Decision</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Reviewed At</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Notes</th>
                          <th className="py-3 px-4 font-medium text-neutral-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedData.data.map(review => (
                          <tr
                            key={review.id}
                            className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors ${
                              selectedDetectionId === review.id ? 'bg-neutral-100' : ''
                            }`}
                            onClick={() => setSelectedDetectionId(review.id === selectedDetectionId ? null : review.id)}
                            role="row"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter') setSelectedDetectionId(review.id); }}
                            data-testid={`completed-row-${review.id}`}
                          >
                            <td className="py-3 px-4 text-neutral-900 font-medium">{review.enumeratorName}</td>
                            <td className="py-3 px-4 text-neutral-600 text-xs">
                              {review.lgaId ? review.lgaId.replace(/_/g, ' ') : '—'}
                            </td>
                            <td className="py-3 px-4 text-neutral-600">{formatDate(review.submittedAt)}</td>
                            <td className="py-3 px-4 text-neutral-900 font-mono">{review.totalScore.toFixed(1)}</td>
                            <td className="py-3 px-4"><FraudSeverityBadge severity={review.severity} /></td>
                            <td className="py-3 px-4"><FraudResolutionBadge resolution={review.resolution} /></td>
                            <td className="py-3 px-4"><AssessorDecisionBadge decision={review.assessorResolution} /></td>
                            <td className="py-3 px-4 text-neutral-600 text-xs">{formatDateTime(review.assessorReviewedAt)}</td>
                            <td className="py-3 px-4 text-neutral-600 text-xs max-w-[200px] truncate" title={review.assessorNotes ?? ''}>
                              {review.assessorNotes || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedDetectionId(review.id);
                                }}
                                aria-label={`View evidence for ${review.enumeratorName}`}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                    <span className="text-sm text-neutral-500">
                      Page {completedData.page} of {completedData.totalPages} ({completedData.totalItems} items)
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= completedData.totalPages}>
                        Next <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Evidence Panel (read-only) */}
        {selectedDetectionId && (
          <div className="w-1/2">
            {isDetailLoading && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </CardContent>
              </Card>
            )}
            {detectionDetail && (
              <ErrorBoundary
                fallbackProps={{ title: 'Evidence Panel Error', description: 'Unable to display evidence.' }}
              >
                <EvidencePanel
                  detection={detectionDetail}
                  onReview={() => {}}
                  renderActions={() => (
                    <div className="text-center text-sm text-neutral-500 py-2">
                      Review completed — read-only view
                    </div>
                  )}
                />
              </ErrorBoundary>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

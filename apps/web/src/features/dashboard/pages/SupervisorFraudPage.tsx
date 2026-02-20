/**
 * Supervisor Fraud Alerts Page
 *
 * Story 4.4: Real fraud detection list with evidence panel and review workflow.
 * Replaces placeholder from Story 2.5-4.
 */

import { useState, useEffect } from 'react';
import { Shield, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { SkeletonTable, SkeletonCard } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { FraudDetectionTable } from '../components/FraudDetectionTable';
import { EvidencePanel } from '../components/EvidencePanel';
import { ReviewDialog } from '../components/ReviewDialog';
import { useFraudDetections, useFraudDetectionDetail, useReviewFraudDetection } from '../hooks/useFraudDetections';
import type { FraudFilterParams } from '../api/fraud.api';

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

const REVIEWED_OPTIONS = [
  { value: undefined, label: 'All' },
  { value: false, label: 'Unreviewed' },
  { value: true, label: 'Reviewed' },
] as const;

export default function SupervisorFraudPage() {
  // Filter state
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [reviewedFilter, setReviewedFilter] = useState<boolean | undefined>(false); // Default: unreviewed
  const [page, setPage] = useState(1);

  // Selection state
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Build query params
  const params: FraudFilterParams = {
    severity: severityFilter.length > 0 ? severityFilter : undefined,
    reviewed: reviewedFilter,
    page,
    limit: 20,
  };

  const { data: listData, isLoading, isError } = useFraudDetections(params);
  const { data: detectionDetail, isLoading: isDetailLoading } = useFraudDetectionDetail(selectedDetectionId);
  const reviewMutation = useReviewFraudDetection();

  // H1 fix: Escape key closes evidence panel (AC4.4.7)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDetectionId) {
        setSelectedDetectionId(null);
        setShowReviewDialog(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDetectionId]);

  const handleToggleSeverity = (value: string) => {
    setSeverityFilter((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
    setPage(1);
  };

  const handleReviewedChange = (value: boolean | undefined) => {
    setReviewedFilter(value);
    setPage(1);
  };

  const handleSelectDetection = (id: string) => {
    setSelectedDetectionId(id === selectedDetectionId ? null : id);
  };

  const handleSubmitReview = (resolution: string, resolutionNotes?: string) => {
    if (!selectedDetectionId) return;
    reviewMutation.mutate(
      { id: selectedDetectionId, resolution, resolutionNotes },
      {
        onSuccess: () => {
          setShowReviewDialog(false);
          setSelectedDetectionId(null);
        },
      },
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">Fraud Alerts</h1>
          <p className="text-neutral-600 mt-1">Review flagged submissions and suspicious activity</p>
        </div>
        {listData && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-neutral-100 text-neutral-700 text-sm font-medium">
            {listData.totalItems} total
          </span>
        )}
      </div>

      {/* Filters (Task 10) */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* Severity multi-select chips */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">Severity:</span>
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleToggleSeverity(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                severityFilter.includes(opt.value)
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Resolution filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">Status:</span>
          {REVIEWED_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleReviewedChange(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                reviewedFilter === opt.value
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-6">
        {/* Detection List */}
        <div className={`${selectedDetectionId ? 'w-1/2' : 'w-full'} transition-all`}>
          <Card>
            <CardContent className="p-0">
              {isLoading && (
                <div className="p-4" aria-busy="true" aria-label="Loading fraud detections">
                  <SkeletonTable rows={5} columns={6} />
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="w-12 h-12 text-red-300 mb-4" />
                  <p className="text-red-600 font-medium">Failed to load fraud detections</p>
                  <p className="text-sm text-neutral-400 mt-1">Please try again later.</p>
                </div>
              )}

              {!isLoading && !isError && listData && listData.data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Shield className="w-12 h-12 text-neutral-300 mb-4" />
                  <p className="text-neutral-500 font-medium">No flagged submissions</p>
                  <p className="text-sm text-neutral-400 mt-1">
                    No fraud detections match your current filters.
                  </p>
                </div>
              )}

              {!isLoading && !isError && listData && listData.data.length > 0 && (
                <>
                  <FraudDetectionTable
                    detections={listData.data}
                    selectedId={selectedDetectionId}
                    onSelectDetection={handleSelectDetection}
                  />

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                    <span className="text-sm text-neutral-500">
                      Page {listData.page} of {listData.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= listData.totalPages}
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Evidence Panel */}
        {selectedDetectionId && (
          <div className="w-1/2">
            {isDetailLoading && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <SkeletonCard showHeader />
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
                  onReview={() => setShowReviewDialog(true)}
                />
              </ErrorBoundary>
            )}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      {detectionDetail && (
        <ReviewDialog
          isOpen={showReviewDialog}
          onClose={() => setShowReviewDialog(false)}
          onSubmit={handleSubmitReview}
          isPending={reviewMutation.isPending}
          enumeratorName={detectionDetail.enumeratorName}
        />
      )}
    </div>
  );
}

/**
 * Supervisor Fraud Alerts Page
 *
 * Story 4.4: Real fraud detection list with evidence panel and review workflow.
 * Story 4.5: Cluster view, multi-select, bulk verification, floating action bar.
 * Replaces placeholder from Story 2.5-4.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Shield, ChevronLeft, ChevronRight, AlertTriangle, List, MapPin } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { SkeletonTable, SkeletonCard } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { FraudDetectionTable } from '../components/FraudDetectionTable';
import { EvidencePanel } from '../components/EvidencePanel';
import { ReviewDialog } from '../components/ReviewDialog';
import { ClusterCard } from '../components/ClusterCard';
import { ClusterDetailView } from '../components/ClusterDetailView';
import { FloatingActionBar } from '../components/FloatingActionBar';
import { BulkVerificationModal } from '../components/BulkVerificationModal';
import {
  useFraudDetections,
  useFraudDetectionDetail,
  useReviewFraudDetection,
  useFraudClusters,
  useBulkReviewFraudDetections,
} from '../hooks/useFraudDetections';
import { useSelectionState } from '../hooks/useSelectionState';
import type { FraudFilterParams, FraudClusterSummary } from '../api/fraud.api';

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

type ViewTab = 'list' | 'clusters';

export default function SupervisorFraudPage() {
  // Filter state
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [reviewedFilter, setReviewedFilter] = useState<boolean | undefined>(false);
  const [page, setPage] = useState(1);

  // View tab state (Story 4.5)
  const [activeTab, setActiveTab] = useState<ViewTab>('list');
  const [activeCluster, setActiveCluster] = useState<FraudClusterSummary | null>(null);

  // Selection state (Story 4.4: individual, Story 4.5: multi-select)
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Multi-select state (Story 4.5)
  const { selectedIds, selectedCount, toggle, selectAll, clearAll, isSelected } = useSelectionState();

  // Animation state (Story 4.5 AC4.5.6)
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const { data: clusters, isLoading: isClustersLoading } = useFraudClusters();
  const bulkReviewMutation = useBulkReviewFraudDetections();

  // Escape key closes evidence panel (AC4.4.7)
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

  // Reset selection on tab/page change (AC4.5.2)
  useEffect(() => {
    clearAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page]);

  // Cleanup animation timer on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

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

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    setActiveCluster(null);
    setSelectedDetectionId(null);
  };

  const handleViewCluster = (cluster: FraudClusterSummary) => {
    setActiveCluster(cluster);
    // Pre-select all cluster members (AC4.5.5)
    selectAll(cluster.detectionIds);
  };

  const handleBulkVerify = useCallback(async (context: string) => {
    const ids = Array.from(selectedIds);
    await bulkReviewMutation.mutateAsync({
      ids,
      resolution: 'false_positive',
      resolutionNotes: context,
    });

    // Show dynamic count toast (AC4.5.3 M1 fix)
    toast.success(`${ids.length} alerts verified as legitimate event`);

    // Trigger staggered animation (AC4.5.6)
    setVerifiedIds(new Set(ids));
    setShowBulkModal(false);
    clearAll();

    // Clear animation state after all animations complete
    const animationDuration = ids.length * 300 + 500;
    animationTimerRef.current = setTimeout(() => {
      setVerifiedIds(new Set());
    }, animationDuration);
  }, [selectedIds, bulkReviewMutation, clearAll]);

  // Get unreviewed IDs for "Select All" (current page)
  const unreviewedIds = listData?.data
    .filter(d => d.resolution === null)
    .map(d => d.id) ?? [];

  const handleSelectAll = () => {
    const allSelected = unreviewedIds.every(id => isSelected(id));
    if (allSelected) {
      clearAll();
    } else {
      selectAll(unreviewedIds);
    }
  };

  const allUnreviewedSelected = unreviewedIds.length > 0 && unreviewedIds.every(id => isSelected(id));

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

      {/* Tab toggle (Story 4.5 AC4.5.1) */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => handleTabChange('list')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            activeTab === 'list'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
          }`}
          data-testid="tab-list"
        >
          <List className="h-4 w-4" />
          List
        </button>
        <button
          onClick={() => handleTabChange('clusters')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            activeTab === 'clusters'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
          }`}
          data-testid="tab-clusters"
        >
          <MapPin className="h-4 w-4" />
          Clusters
          {clusters && clusters.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              {clusters.length}
            </span>
          )}
        </button>
      </div>

      {/* Filters (shown in list view only) */}
      {activeTab === 'list' && (
        <div className="mb-4 flex flex-wrap items-center gap-4">
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
      )}

      {/* ── LIST VIEW ── */}
      {activeTab === 'list' && (
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
                      multiSelect
                      isItemSelected={isSelected}
                      onToggleSelect={toggle}
                      onSelectAll={handleSelectAll}
                      allSelected={allUnreviewedSelected}
                      verifiedIds={verifiedIds}
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
                    onReview={() => setShowReviewDialog(true)}
                  />
                </ErrorBoundary>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CLUSTERS VIEW ── */}
      {activeTab === 'clusters' && !activeCluster && (
        <div>
          {isClustersLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} lines={4} />
              ))}
            </div>
          )}

          {!isClustersLoading && clusters && clusters.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MapPin className="w-12 h-12 text-neutral-300 mb-4" />
              <p className="text-neutral-500 font-medium">No GPS clusters detected</p>
              <p className="text-sm text-neutral-400 mt-1">
                Clusters appear when multiple unreviewed detections share GPS proximity.
              </p>
            </div>
          )}

          {!isClustersLoading && clusters && clusters.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clusters.map((cluster) => (
                <ClusterCard
                  key={cluster.clusterId}
                  cluster={cluster}
                  onViewCluster={handleViewCluster}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CLUSTER DETAIL VIEW ── */}
      {activeTab === 'clusters' && activeCluster && (
        <ClusterDetailView
          cluster={activeCluster}
          selectedIds={selectedIds}
          onToggle={toggle}
          onBack={() => { setActiveCluster(null); clearAll(); }}
        />
      )}

      {/* Floating Action Bar (Story 4.5 AC4.5.2) */}
      <FloatingActionBar
        selectedCount={selectedCount}
        onVerify={() => setShowBulkModal(true)}
        onClear={clearAll}
      />

      {/* Bulk Verification Modal (Story 4.5 AC4.5.3) */}
      <BulkVerificationModal
        isOpen={showBulkModal}
        alertCount={selectedCount}
        onVerify={handleBulkVerify}
        onCancel={() => setShowBulkModal(false)}
        isPending={bulkReviewMutation.isPending}
      />

      {/* Review Dialog (Story 4.4) */}
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

/**
 * Assessor Verification Queue Page
 *
 * Story 5.2: Split-panel layout with queue list (left) and EvidencePanel (right).
 * Reuses FraudDetectionTable with LGA + Supervisor Resolution columns.
 * Server-side filtering: LGA, severity, supervisor resolution, date range, enumerator name.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSearch, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { SkeletonTable, SkeletonCard } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { FraudDetectionTable } from '../components/FraudDetectionTable';
import { EvidencePanel } from '../components/EvidencePanel';
import { AssessorReviewActions } from '../components/AssessorReviewActions';
import { useAuditQueue, useQueueStats } from '../hooks/useAssessor';
import { useFraudDetectionDetail } from '../hooks/useFraudDetections';
import { Lga } from '@oslsr/types';
import type { AuditQueueFilters } from '../api/assessor.api';

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

const SUPERVISOR_RESOLUTION_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'confirmed_fraud', label: 'Confirmed Fraud' },
  { value: 'false_positive', label: 'False Positive' },
  { value: 'needs_investigation', label: 'Needs Investigation' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'enumerator_warned', label: 'Warned' },
  { value: 'enumerator_suspended', label: 'Suspended' },
] as const;

const LGA_OPTIONS = Object.values(Lga).map(lga => ({
  value: lga,
  label: lga.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
}));

export default function AssessorQueuePage() {
  // Read initial filter state from URL search params (set by Home quick filters)
  const [searchParams] = useSearchParams();

  // Filter state — initialize from URL params if present
  const [lgaFilter, setLgaFilter] = useState(() => searchParams.get('lgaId') ?? '');
  const [severityFilter, setSeverityFilter] = useState<string[]>(() => {
    const sv = searchParams.get('severity');
    return sv ? sv.split(',').filter(Boolean) : [];
  });
  const [supervisorResolution, setSupervisorResolution] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [enumeratorName, setEnumeratorName] = useState('');
  const [page, setPage] = useState(1);

  // Selection state
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);

  // Build query params
  const filters: AuditQueueFilters = {
    lgaId: lgaFilter || undefined,
    severity: severityFilter.length > 0 ? severityFilter : undefined,
    supervisorResolution: supervisorResolution || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    enumeratorName: enumeratorName || undefined,
    page,
    pageSize: 20,
  };

  const { data: queueData, isLoading, isError } = useAuditQueue(filters);
  const { data: stats } = useQueueStats();
  const { data: detectionDetail, isLoading: isDetailLoading } = useFraudDetectionDetail(selectedDetectionId);

  // Escape key closes evidence panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDetectionId) {
        setSelectedDetectionId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDetectionId]);

  const handleToggleSeverity = (value: string) => {
    setSeverityFilter(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
    setPage(1);
  };

  const handleSelectDetection = (id: string) => {
    setSelectedDetectionId(id === selectedDetectionId ? null : id);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Verification Queue</h1>
        <p className="text-neutral-600 mt-1">Review and finalize fraud detection decisions</p>
      </div>

      {/* Stats summary strip */}
      {stats && (
        <div className="mb-4 flex gap-4" data-testid="stats-strip">
          <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-sm font-medium">
            {stats.totalPending} pending
          </div>
          <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-green-50 text-green-800 text-sm font-medium">
            {stats.reviewedToday} reviewed today
          </div>
          {stats.severityBreakdown.high != null && stats.severityBreakdown.high > 0 && (
            <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-50 text-red-800 text-sm font-medium">
              {(stats.severityBreakdown.high ?? 0) + (stats.severityBreakdown.critical ?? 0)} high severity
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-4" data-testid="filter-bar">
        {/* LGA dropdown */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">LGA</label>
          <select
            data-testid="lga-filter"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={lgaFilter}
            onChange={e => { setLgaFilter(e.target.value); setPage(1); }}
          >
            <option value="">All LGAs</option>
            {LGA_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Severity multi-select */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Severity</label>
          <div className="flex gap-1">
            {SEVERITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleToggleSeverity(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  severityFilter.includes(opt.value)
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Supervisor resolution */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Supervisor Decision</label>
          <select
            data-testid="resolution-filter"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={supervisorResolution}
            onChange={e => { setSupervisorResolution(e.target.value); setPage(1); }}
          >
            {SUPERVISOR_RESOLUTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Date From</label>
          <input
            type="date"
            data-testid="date-from"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Date To</label>
          <input
            type="date"
            data-testid="date-to"
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>

        {/* Enumerator name search */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Enumerator</label>
          <input
            type="text"
            data-testid="enumerator-search"
            placeholder="Search name..."
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white"
            value={enumeratorName}
            onChange={e => { setEnumeratorName(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Split-panel layout */}
      <div className="flex gap-6">
        {/* Queue list */}
        <div className={`${selectedDetectionId ? 'w-1/2' : 'w-full'} transition-all`}>
          <Card>
            <CardContent className="p-0">
              {isLoading && (
                <div className="p-4" aria-busy="true" aria-label="Loading audit queue">
                  <SkeletonTable rows={5} columns={7} />
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="w-12 h-12 text-red-300 mb-4" />
                  <p className="text-red-600 font-medium">Failed to load audit queue</p>
                  <p className="text-sm text-neutral-400 mt-1">Please try again later.</p>
                </div>
              )}

              {!isLoading && !isError && queueData && queueData.data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
                  <FileSearch className="w-12 h-12 text-neutral-300 mb-4" />
                  <p className="text-neutral-500 font-medium">No submissions in queue</p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Submissions verified by supervisors or flagged high-severity will appear here.
                  </p>
                </div>
              )}

              {!isLoading && !isError && queueData && queueData.data.length > 0 && (
                <>
                  <FraudDetectionTable
                    detections={queueData.data}
                    selectedId={selectedDetectionId}
                    onSelectDetection={handleSelectDetection}
                    showLgaColumn
                    showSupervisorResolutionColumn
                  />

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                    <span className="text-sm text-neutral-500">
                      Page {queueData.page} of {queueData.totalPages} ({queueData.totalItems} items)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page >= queueData.totalPages}
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
                  onReview={() => {}}
                  renderActions={() => (
                    <AssessorReviewActions
                      detectionId={detectionDetail.id}
                      supervisorResolution={detectionDetail.resolution}
                      onReviewComplete={() => setSelectedDetectionId(null)}
                    />
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

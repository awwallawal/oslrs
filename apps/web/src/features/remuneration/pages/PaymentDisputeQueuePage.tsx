/**
 * Payment Dispute Queue Page
 * Story 6.6: Super Admin dispute resolution queue.
 * Pattern: AssessorQueuePage.tsx split-panel layout.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { DisputeQueueTable } from '../components/DisputeQueueTable';
import { DisputeDetailPanel } from '../components/DisputeDetailPanel';
import { ResolutionDialog } from '../components/ResolutionDialog';
import { useDisputeQueue, useDisputeStats, useDisputeDetail } from '../hooks/useRemuneration';
import type { DisputeQueueFilters } from '../api/remuneration.api';
import { Scale, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'disputed', label: 'Disputed' },
  { value: 'pending_resolution', label: 'Pending' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function PaymentDisputeQueuePage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);

  const filters: DisputeQueueFilters = {
    page,
    limit: 20,
    ...(statusFilter.length > 0 ? { status: statusFilter } : {}),
    ...(searchQuery ? { search: searchQuery } : {}),
  };

  const { data: queueData, isLoading: queueLoading } = useDisputeQueue(filters);
  const { data: statsData } = useDisputeStats();
  const { data: detailData } = useDisputeDetail(selectedDisputeId);

  const stats = statsData?.data;
  const disputes = queueData?.data ?? [];
  const pagination = queueData?.pagination;

  // Escape key closes selection
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedDisputeId(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6" data-testid="payment-dispute-queue-page">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-5 h-5 text-neutral-700" />
          <h1 className="text-xl font-semibold">Payment Disputes</h1>
        </div>
        <p className="text-sm text-neutral-500">
          Review and resolve staff payment disputes. Disputes auto-close 30 days after resolution.
        </p>
      </div>

      {/* Stats Strip */}
      {stats && (
        <div className="flex gap-3 flex-wrap" data-testid="dispute-stats">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-sm">
            <span className="font-semibold text-amber-700">{stats.totalOpen}</span>
            <span className="text-amber-600">Open</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-sm">
            <span className="font-semibold text-blue-700">{stats.pending}</span>
            <span className="text-blue-600">Pending Resolution</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md text-sm">
            <span className="font-semibold text-green-700">{stats.resolvedThisMonth}</span>
            <span className="text-green-600">Resolved This Month</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm">
            <span className="font-semibold text-gray-700">{stats.closed}</span>
            <span className="text-gray-600">Closed</span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleStatusFilter(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                statusFilter.includes(opt.value)
                  ? 'bg-neutral-800 text-white border-neutral-800'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
              }`}
              data-testid={`filter-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by staff name..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-400 w-48"
          data-testid="search-input"
        />
      </div>

      {/* Split-Panel Layout */}
      <div className="flex gap-6">
        {/* Left panel — queue table */}
        <div className={`${selectedDisputeId ? 'w-1/2' : 'w-full'} transition-all`}>
          <Card>
            <CardContent className="p-0">
              <DisputeQueueTable
                disputes={disputes}
                selectedId={selectedDisputeId}
                onSelectDispute={setSelectedDisputeId}
                isLoading={queueLoading}
              />

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t text-sm">
                  <span className="text-neutral-500">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page <= 1}
                      className="flex items-center gap-1 px-2 py-1 text-sm border rounded disabled:opacity-50 hover:bg-neutral-50"
                      data-testid="prev-page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="flex items-center gap-1 px-2 py-1 text-sm border rounded disabled:opacity-50 hover:bg-neutral-50"
                      data-testid="next-page"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel — detail + actions */}
        {selectedDisputeId && (
          <div className="w-1/2">
            <DisputeDetailPanel
              disputeId={selectedDisputeId}
              onResolve={() => setShowResolutionDialog(true)}
              onClose={() => setSelectedDisputeId(null)}
            />
          </div>
        )}
      </div>

      {/* Resolution Dialog */}
      <ResolutionDialog
        dispute={detailData?.data ?? null}
        isOpen={showResolutionDialog}
        onClose={() => setShowResolutionDialog(false)}
        onSuccess={() => setSelectedDisputeId(null)}
      />
    </div>
  );
}

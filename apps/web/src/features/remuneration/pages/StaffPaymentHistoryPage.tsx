/**
 * StaffPaymentHistoryPage — Staff payment history with dispute capability.
 * Story 6.5 AC1, AC4, AC5: Paginated payment records with Report Issue dialog.
 * Shared by Enumerator and Supervisor dashboards (role-agnostic via useAuth).
 */

import { useState } from 'react';
import { useAuth } from '../../auth/context/AuthContext';
import { useMyPaymentHistory } from '../hooks/useRemuneration';
import ReportIssueDialog from '../components/ReportIssueDialog';
import type { StaffPaymentRecord } from '../api/remuneration.api';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { formatNaira } from '../utils/format';

/** Status badge color mapping */
const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  disputed: 'bg-amber-100 text-amber-800',
  corrected: 'bg-gray-100 text-gray-800',
};

/** Dispute status badge colors */
const disputeStatusColors: Record<string, string> = {
  disputed: 'bg-amber-100 text-amber-800',
  pending_resolution: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  reopened: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-800',
};

export default function StaffPaymentHistoryPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [disputeRecord, setDisputeRecord] = useState<StaffPaymentRecord | null>(null);

  const { data, isLoading, isError } = useMyPaymentHistory(user?.id ?? '', { page, limit: 10 });

  const records = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 0 };

  const toggleRow = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  return (
    <div data-testid="staff-payment-history-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
        <p className="text-muted-foreground mt-1">View your recorded payments and report any issues.</p>
      </div>

      {isError && (
        <div data-testid="payment-history-error" className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>Failed to load payment history. Please try again later.</p>
        </div>
      )}

      {!isLoading && !isError && records.length === 0 && (
        <div data-testid="payment-history-empty" className="text-center py-12 text-muted-foreground">
          <p>No payment records yet.</p>
          <p className="text-sm mt-1">Your payments will appear here once recorded by an administrator.</p>
        </div>
      )}

      {(isLoading || records.length > 0) && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm" data-testid="payment-history-table">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="text-left px-3 py-3 font-medium">Tranche</th>
                <th className="text-left px-3 py-3 font-medium">Amount</th>
                <th className="text-left px-3 py-3 font-medium">Date</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="text-left px-3 py-3 font-medium">Bank Ref</th>
                <th className="text-right px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading payment history...
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <PaymentRow
                    key={record.id}
                    record={record}
                    isExpanded={expandedRowId === record.id}
                    onToggle={() => toggleRow(record.id)}
                    onReportIssue={() => setDisputeRecord(record)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between" data-testid="payment-history-pagination">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Report Issue Dialog */}
      <ReportIssueDialog
        paymentRecord={disputeRecord}
        isOpen={!!disputeRecord}
        onClose={() => setDisputeRecord(null)}
      />
    </div>
  );
}

/** Individual payment row with expandable detail */
function PaymentRow({
  record,
  isExpanded,
  onToggle,
  onReportIssue,
}: {
  record: StaffPaymentRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onReportIssue: () => void;
}) {
  const date = new Date(record.effectiveFrom).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      <tr
        className="border-t hover:bg-muted/30 cursor-pointer"
        onClick={onToggle}
        data-testid={`payment-row-${record.id}`}
      >
        <td className="px-3 py-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-3 py-3">{record.trancheName}</td>
        <td className="px-3 py-3 font-mono" data-testid="payment-amount">
          {formatNaira(record.amount)}
        </td>
        <td className="px-3 py-3">{date}</td>
        <td className="px-3 py-3">
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[record.status] ?? 'bg-gray-100 text-gray-800'}`}
            data-testid="payment-status-badge"
          >
            {record.status}
          </span>
        </td>
        <td className="px-3 py-3 text-muted-foreground">{record.bankReference || '—'}</td>
        <td className="px-3 py-3 text-right">
          {record.status === 'active' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReportIssue();
              }}
              className="px-3 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
              data-testid="report-issue-button"
            >
              Report Issue
            </button>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="border-t bg-muted/20" data-testid={`payment-detail-${record.id}`}>
          <td colSpan={7} className="px-6 py-4">
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <span className="text-muted-foreground">Tranche #:</span>{' '}
                  {record.trancheNumber}
                </div>
                <div>
                  <span className="text-muted-foreground">Batch ID:</span>{' '}
                  <span className="font-mono text-xs">{record.batchId.substring(0, 8)}...</span>
                </div>
              </div>

              {/* Dispute details if exists */}
              {record.disputeId && (
                <div
                  className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2"
                  data-testid="dispute-detail"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-amber-800">Dispute Details</span>
                    <span
                      className={`ml-auto inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        disputeStatusColors[record.disputeStatus ?? ''] ?? 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {record.disputeStatus?.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Your comment:</span>
                    <p className="mt-1">{record.disputeComment}</p>
                  </div>
                  {record.disputeAdminResponse && (
                    <div>
                      <span className="text-muted-foreground">Admin response:</span>
                      <p className="mt-1">{record.disputeAdminResponse}</p>
                    </div>
                  )}
                  {record.disputeResolvedAt && (
                    <div>
                      <span className="text-muted-foreground">Resolved:</span>{' '}
                      {new Date(record.disputeResolvedAt).toLocaleDateString('en-NG')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

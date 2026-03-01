/**
 * Dispute Detail Panel
 * Story 6.6: Right-side panel showing full dispute context and action buttons.
 * Pattern: EvidencePanel.tsx + BatchDetailPanel.tsx.
 */

import { X, Download, CheckCircle2, Clock, AlertCircle, Lock } from 'lucide-react';
import { DisputeStatusBadge } from './DisputeStatusBadge';
import { formatNaira } from '../utils/format';
import { useDisputeDetail, useAcknowledgeDispute } from '../hooks/useRemuneration';
import { API_BASE_URL, getAuthHeaders } from '../../../lib/api-client';

interface DisputeDetailPanelProps {
  disputeId: string;
  onResolve: () => void;
  onClose: () => void;
}

export function DisputeDetailPanel({ disputeId, onResolve, onClose }: DisputeDetailPanelProps) {
  const { data, isLoading, isError } = useDisputeDetail(disputeId);
  const acknowledgeMutation = useAcknowledgeDispute();

  if (isLoading) {
    return (
      <div className="border rounded-lg p-6 bg-white" data-testid="dispute-detail-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-neutral-200 rounded w-3/4" />
          <div className="h-4 bg-neutral-200 rounded w-1/2" />
          <div className="h-20 bg-neutral-200 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="border rounded-lg p-6 bg-white" data-testid="dispute-detail-error">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Failed to load dispute details</span>
        </div>
      </div>
    );
  }

  const dispute = data.data;

  const handleAcknowledge = () => {
    acknowledgeMutation.mutate(dispute.id);
  };

  const handleDownloadEvidence = () => {
    if (!dispute.evidenceFileId) return;
    const link = document.createElement('a');
    link.href = `${API_BASE_URL}/remuneration/files/${dispute.evidenceFileId}`;
    // Add auth header via fetch
    fetch(link.href, { headers: getAuthHeaders() })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = dispute.evidenceFile?.originalFilename || 'evidence';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  // Parse comments to show original + reopens
  const commentParts = dispute.staffComment.split('\n\n---\n');

  return (
    <div className="border rounded-lg bg-white overflow-hidden" data-testid="dispute-detail-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-neutral-50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Dispute Detail</h3>
          <DisputeStatusBadge status={dispute.status} />
        </div>
        <button onClick={onClose} className="p-1 hover:bg-neutral-200 rounded" data-testid="close-detail-panel">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-300px)]">
        {/* Staff Info */}
        <section>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Staff Info</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-neutral-500">Name:</span>{' '}
              <span className="font-medium">{dispute.staffName || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-neutral-500">Role:</span>{' '}
              <span className="font-medium">{dispute.staffRoleName || '—'}</span>
            </div>
            <div>
              <span className="text-neutral-500">LGA:</span>{' '}
              <span className="font-medium">{dispute.staffLgaName || '—'}</span>
            </div>
            <div>
              <span className="text-neutral-500">Email:</span>{' '}
              <span className="font-medium">{dispute.staffEmail || '—'}</span>
            </div>
          </div>
        </section>

        {/* Payment Details */}
        <section>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Payment Details</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-neutral-500">Tranche:</span>{' '}
              <span className="font-medium">{dispute.trancheName}</span>
            </div>
            <div>
              <span className="text-neutral-500">Amount:</span>{' '}
              <span className="font-medium">{formatNaira(dispute.amount)}</span>
            </div>
            <div>
              <span className="text-neutral-500">Batch Date:</span>{' '}
              <span className="font-medium">
                {new Date(dispute.batchDate).toLocaleDateString('en-NG')}
              </span>
            </div>
            <div>
              <span className="text-neutral-500">Bank Ref:</span>{' '}
              <span className="font-medium">{dispute.bankReference || '—'}</span>
            </div>
          </div>
        </section>

        {/* Dispute Timeline */}
        <section>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Timeline</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Opened: {new Date(dispute.createdAt).toLocaleString('en-NG')}</span>
            </div>
            {dispute.resolvedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span>Resolved: {new Date(dispute.resolvedAt).toLocaleString('en-NG')}</span>
              </div>
            )}
            {dispute.reopenCount > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                <span>Reopened {dispute.reopenCount} time{dispute.reopenCount !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </section>

        {/* Staff Comment */}
        <section>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Staff Comment</h4>
          <div className="space-y-3">
            {commentParts.map((part, index) => (
              <div
                key={index}
                className={`text-sm p-3 rounded-md ${
                  index === 0 ? 'bg-amber-50 border border-amber-100' : 'bg-orange-50 border border-orange-100'
                }`}
                data-testid={`staff-comment-${index}`}
              >
                <p className="whitespace-pre-wrap">{part}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Admin Response (if resolved) */}
        {dispute.adminResponse && (
          <section>
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Admin Response</h4>
            <div className="text-sm p-3 bg-green-50 border border-green-100 rounded-md">
              <p className="whitespace-pre-wrap">{dispute.adminResponse}</p>
              {dispute.resolvedByName && (
                <p className="text-xs text-neutral-500 mt-2">
                  — Resolved by {dispute.resolvedByName}
                  {dispute.resolvedAt && ` on ${new Date(dispute.resolvedAt).toLocaleDateString('en-NG')}`}
                </p>
              )}
            </div>

            {/* Evidence download */}
            {dispute.evidenceFile && (
              <button
                onClick={handleDownloadEvidence}
                className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                data-testid="download-evidence-button"
              >
                <Download className="w-3.5 h-3.5" />
                {dispute.evidenceFile.originalFilename}
              </button>
            )}
          </section>
        )}

        {/* Action Buttons */}
        <section className="pt-2 border-t">
          {dispute.status === 'disputed' && (
            <button
              onClick={handleAcknowledge}
              disabled={acknowledgeMutation.isPending}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 transition-colors"
              data-testid="acknowledge-button"
            >
              {acknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge Dispute'}
            </button>
          )}

          {(dispute.status === 'pending_resolution' || dispute.status === 'reopened') && (
            <button
              onClick={onResolve}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
              data-testid="resolve-button"
            >
              Resolve Dispute
            </button>
          )}

          {dispute.status === 'resolved' && (
            <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-md text-sm text-neutral-600">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Resolved — Staff can reopen via their Payment History
            </div>
          )}

          {dispute.status === 'closed' && (
            <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-md text-sm text-neutral-500">
              <Lock className="w-4 h-4" />
              Closed — No further action
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

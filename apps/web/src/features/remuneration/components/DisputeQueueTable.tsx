/**
 * Dispute Queue Table
 * Story 6.6: Selectable table rows for the dispute queue.
 * Pattern: FraudDetectionTable.tsx — selectable rows, hover effect.
 */

import { DisputeStatusBadge } from './DisputeStatusBadge';
import { formatNaira } from '../utils/format';
import type { DisputeQueueItem } from '../api/remuneration.api';

interface DisputeQueueTableProps {
  disputes: DisputeQueueItem[];
  selectedId: string | null;
  onSelectDispute: (id: string) => void;
  isLoading?: boolean;
}

export function DisputeQueueTable({ disputes, selectedId, onSelectDispute, isLoading }: DisputeQueueTableProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-neutral-500" data-testid="dispute-table-loading">
        Loading disputes...
      </div>
    );
  }

  if (disputes.length === 0) {
    return (
      <div className="p-8 text-center text-neutral-500" data-testid="dispute-table-empty">
        No payment disputes. Staff payment issues will appear here when reported.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="dispute-queue-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-neutral-50">
            <th className="text-left p-3 font-medium text-neutral-600">Staff Name</th>
            <th className="text-left p-3 font-medium text-neutral-600">Tranche</th>
            <th className="text-right p-3 font-medium text-neutral-600">Amount</th>
            <th className="text-left p-3 font-medium text-neutral-600">Status</th>
            <th className="text-left p-3 font-medium text-neutral-600">Dispute Date</th>
            <th className="text-center p-3 font-medium text-neutral-600">Reopens</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((dispute) => (
            <tr
              key={dispute.id}
              onClick={() => onSelectDispute(dispute.id)}
              className={`border-b cursor-pointer transition-colors hover:bg-neutral-50 ${
                selectedId === dispute.id ? 'bg-neutral-100' : ''
              }`}
              data-testid={`dispute-row-${dispute.id}`}
            >
              <td className="p-3">{dispute.staffName || 'Unknown'}</td>
              <td className="p-3 text-neutral-600">{dispute.trancheName}</td>
              <td className="p-3 text-right font-medium">{formatNaira(dispute.amount)}</td>
              <td className="p-3">
                <DisputeStatusBadge status={dispute.status} />
              </td>
              <td className="p-3 text-neutral-600">
                {new Date(dispute.createdAt).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
              <td className="p-3 text-center">
                {dispute.reopenCount > 0 ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                    {dispute.reopenCount}
                  </span>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

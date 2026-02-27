/**
 * PaymentBatchTable — Batch history table with pagination.
 * Story 6.4 AC5: Display batch history with tranche, date, count, amount, status.
 */

import type { PaymentBatch } from '../api/remuneration.api';
import { Button } from '../../../components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaymentBatchTableProps {
  batches: PaymentBatch[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onBatchClick: (batchId: string) => void;
  isLoading?: boolean;
}

/** Format kobo amount as Naira */
export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export default function PaymentBatchTable({
  batches,
  pagination,
  onPageChange,
  onBatchClick,
  isLoading,
}: PaymentBatchTableProps) {
  if (isLoading) {
    return (
      <div data-testid="batch-table-loading" className="py-8 text-center text-muted-foreground">
        Loading batches...
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div data-testid="batch-table-empty" className="py-8 text-center text-muted-foreground">
        No payment batches found.
      </div>
    );
  }

  return (
    <div data-testid="batch-table">
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">Tranche</th>
              <th className="p-3 text-left font-medium">Date</th>
              <th className="p-3 text-right font-medium">Staff</th>
              <th className="p-3 text-right font-medium">Total Amount</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr
                key={batch.id}
                data-testid={`batch-row-${batch.id}`}
                className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onBatchClick(batch.id)}
              >
                <td className="p-3 font-medium">{batch.trancheName}</td>
                <td className="p-3 text-muted-foreground">
                  {new Date(batch.createdAt).toLocaleDateString('en-NG')}
                </td>
                <td className="p-3 text-right">{batch.staffCount}</td>
                <td className="p-3 text-right font-mono">{formatNaira(batch.totalAmount)}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      batch.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {batch.status}
                  </span>
                </td>
                <td className="p-3">{batch.recordedByName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

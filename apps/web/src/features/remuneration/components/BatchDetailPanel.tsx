/**
 * BatchDetailPanel — Slide-over detail view for a payment batch.
 * Story 6.4: Shows batch info + individual payment records.
 */

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { X } from 'lucide-react';
import { formatNaira } from './PaymentBatchTable';
import type { BatchDetail } from '../api/remuneration.api';

interface BatchDetailPanelProps {
  batch: BatchDetail | null;
  isLoading: boolean;
  onClose: () => void;
}

export default function BatchDetailPanel({ batch, isLoading, onClose }: BatchDetailPanelProps) {
  if (isLoading) {
    return (
      <Card data-testid="batch-detail-loading">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading batch details...
        </CardContent>
      </Card>
    );
  }

  if (!batch) return null;

  return (
    <Card data-testid="batch-detail-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{batch.trancheName}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Tranche #</p>
            <p className="font-medium">{batch.trancheNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium capitalize">{batch.status}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Staff Count</p>
            <p className="font-medium">{batch.staffCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Amount</p>
            <p className="font-medium">{formatNaira(batch.totalAmount)}</p>
          </div>
          {batch.bankReference && (
            <div>
              <p className="text-muted-foreground">Bank Reference</p>
              <p className="font-medium">{batch.bankReference}</p>
            </div>
          )}
          {batch.description && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Description</p>
              <p className="font-medium">{batch.description}</p>
            </div>
          )}
          {batch.receiptFile && (
            <div>
              <p className="text-muted-foreground">Receipt</p>
              <p className="font-medium">{batch.receiptFile.originalFilename}</p>
            </div>
          )}
        </div>

        {batch.records.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Individual Records</h3>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">Staff</th>
                    <th className="p-2 text-left font-medium">Email</th>
                    <th className="p-2 text-right font-medium">Amount</th>
                    <th className="p-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.records.map((record) => (
                    <tr key={record.id} className="border-b">
                      <td className="p-2">{record.staffName || '—'}</td>
                      <td className="p-2 text-muted-foreground">{record.staffEmail || '—'}</td>
                      <td className="p-2 text-right font-mono">{formatNaira(record.amount)}</td>
                      <td className="p-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          record.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * RemunerationPage — Super Admin bulk payment recording & history.
 * Story 6.4 AC5: Record New Payment form + Payment Batch History table.
 */

import { useState } from 'react';
import BulkRecordingForm from '../components/BulkRecordingForm';
import PaymentBatchTable from '../components/PaymentBatchTable';
import BatchDetailPanel from '../components/BatchDetailPanel';
import { usePaymentBatches, useBatchDetail } from '../hooks/useRemuneration';
import { useLgas } from '../../staff/hooks/useStaff';

export default function RemunerationPage() {
  const [page, setPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const { data: lgasData } = useLgas();
  const lgas = (lgasData?.data ?? []).map((l) => ({ id: l.id, name: l.name }));

  const { data: batchesData, isLoading: batchesLoading } = usePaymentBatches({ page, limit: 10 });
  const { data: detailData, isLoading: detailLoading } = useBatchDetail(selectedBatchId);

  return (
    <div data-testid="remuneration-page" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff Remuneration</h1>
        <p className="text-muted-foreground mt-1">Record and manage bulk staff payments.</p>
      </div>

      <BulkRecordingForm lgas={lgas} />

      <div>
        <h2 className="text-lg font-semibold mb-4">Payment Batch History</h2>
        <PaymentBatchTable
          batches={batchesData?.data ?? []}
          pagination={batchesData?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 0 }}
          onPageChange={setPage}
          onBatchClick={setSelectedBatchId}
          isLoading={batchesLoading}
        />
      </div>

      {selectedBatchId && (
        <BatchDetailPanel
          batch={detailData?.data ?? null}
          isLoading={detailLoading}
          onClose={() => setSelectedBatchId(null)}
        />
      )}
    </div>
  );
}

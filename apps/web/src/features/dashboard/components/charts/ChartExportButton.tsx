/**
 * Chart Export Button
 *
 * Story 8.2: Small icon button that exports chart data as CSV.
 */

import { Download } from 'lucide-react';
import { exportToCSV } from '../../utils/csv-export';

interface ChartExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
}

export function ChartExportButton({ data, filename }: ChartExportButtonProps) {
  return (
    <button
      type="button"
      onClick={() => exportToCSV(data, filename)}
      disabled={!data || data.length === 0}
      className="rounded-md p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      title="Export as CSV"
      aria-label={`Export ${filename} as CSV`}
    >
      <Download className="h-4 w-4" />
    </button>
  );
}

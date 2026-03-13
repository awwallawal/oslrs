import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ThresholdGuard } from '../ThresholdGuard';
import { useCrossTab } from '../../hooks/useAnalytics';
import { CrossTabDimension, CrossTabMeasure } from '@oslsr/types';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { SkeletonCard } from '../../../../components/skeletons';

const CROSS_TAB_MIN_N = 50;

const DIMENSION_LABELS: Record<CrossTabDimension, string> = {
  [CrossTabDimension.GENDER]: 'Gender',
  [CrossTabDimension.AGE_BAND]: 'Age Band',
  [CrossTabDimension.EDUCATION]: 'Education Level',
  [CrossTabDimension.LGA]: 'LGA',
  [CrossTabDimension.EMPLOYMENT_TYPE]: 'Employment Type',
  [CrossTabDimension.MARITAL_STATUS]: 'Marital Status',
  [CrossTabDimension.HOUSING]: 'Housing Status',
  [CrossTabDimension.DISABILITY]: 'Disability Status',
};

const MEASURE_LABELS: Record<CrossTabMeasure, string> = {
  [CrossTabMeasure.COUNT]: 'Count',
  [CrossTabMeasure.ROW_PCT]: 'Row %',
  [CrossTabMeasure.COL_PCT]: 'Col %',
  [CrossTabMeasure.TOTAL_PCT]: 'Total %',
};

interface CrossTabTableProps {
  params?: AnalyticsQueryParams;
}

export function CrossTabTable({ params }: CrossTabTableProps) {
  const [rowDim, setRowDim] = useState<CrossTabDimension>(CrossTabDimension.GENDER);
  const [colDim, setColDim] = useState<CrossTabDimension>(CrossTabDimension.EMPLOYMENT_TYPE);
  const [measure, setMeasure] = useState<CrossTabMeasure>(CrossTabMeasure.COUNT);

  const { data, isLoading, isError } = useCrossTab(
    { rowDim, colDim, measure },
    params,
  );

  if (isLoading) return <SkeletonCard data-testid="cross-tab-skeleton" />;

  if (isError) {
    return (
      <Card className="p-6 text-center text-red-600" data-testid="cross-tab-error">
        Failed to load cross-tabulation data.
      </Card>
    );
  }

  if (!data) return null;

  if (data.belowThreshold) {
    return (
      <ThresholdGuard
        threshold={{ met: false, currentN: data.currentN ?? 0, requiredN: data.requiredN ?? CROSS_TAB_MIN_N }}
        label="Cross-tabulation"
      >
        <div />
      </ThresholdGuard>
    );
  }

  if (data.totalN === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        No data available for this scope.
      </Card>
    );
  }

  // Compute max cell value for heatmap intensity
  const maxVal = Math.max(
    1,
    ...data.cells.flatMap((row) =>
      row.map((c) => (c !== null ? c : 0)),
    ),
  );

  const dimensions = Object.values(CrossTabDimension);

  return (
    <Card data-testid="cross-tab-table">
      <CardHeader>
        <CardTitle className="text-lg">Cross-Tabulation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-end">
          {/* Row dimension */}
          <div>
            <label htmlFor="row-dim" className="text-sm font-medium text-gray-700 block mb-1">
              Row
            </label>
            <select
              id="row-dim"
              value={rowDim}
              onChange={(e) => setRowDim(e.target.value as CrossTabDimension)}
              className="border rounded-md px-3 py-2 text-sm"
              data-testid="row-dim-select"
            >
              {dimensions.map((d) => (
                <option key={d} value={d} disabled={d === colDim}>
                  {DIMENSION_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          {/* Column dimension */}
          <div>
            <label htmlFor="col-dim" className="text-sm font-medium text-gray-700 block mb-1">
              Column
            </label>
            <select
              id="col-dim"
              value={colDim}
              onChange={(e) => setColDim(e.target.value as CrossTabDimension)}
              className="border rounded-md px-3 py-2 text-sm"
              data-testid="col-dim-select"
            >
              {dimensions.map((d) => (
                <option key={d} value={d} disabled={d === rowDim}>
                  {DIMENSION_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          {/* Measure toggle */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Measure
            </label>
            <div className="flex rounded-md border overflow-hidden" data-testid="measure-toggle">
              {Object.values(CrossTabMeasure).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMeasure(m)}
                  className={`px-3 py-2 text-sm border-r last:border-r-0 ${
                    measure === m
                      ? 'bg-[#9C1E23] text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {MEASURE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Suppression notice */}
        {data.anySuppressed && (
          <div
            className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2 rounded"
            data-testid="suppression-banner"
          >
            Some cells suppressed (&lt; 5 observations) to protect privacy.
          </div>
        )}

        {/* Heatmap table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" data-testid="heatmap-table">
            <thead>
              <tr>
                <th className="border p-2 bg-gray-50 text-left">
                  {DIMENSION_LABELS[rowDim]} / {DIMENSION_LABELS[colDim]}
                </th>
                {data.colLabels.map((col) => (
                  <th key={col} className="border p-2 bg-gray-50 text-center">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rowLabels.map((row, ri) => (
                <tr key={row}>
                  <td className="border p-2 font-medium bg-gray-50">{row}</td>
                  {data.cells[ri].map((cell, ci) => {
                    if (cell === null) {
                      return (
                        <td
                          key={`${ri}-${ci}`}
                          className="border p-2 text-center text-muted-foreground italic bg-gray-100"
                        >
                          &lt; 5
                        </td>
                      );
                    }
                    const intensity = maxVal > 0 ? cell / maxVal : 0;
                    return (
                      <td
                        key={`${ri}-${ci}`}
                        className="border p-2 text-center"
                        style={{
                          backgroundColor: `rgba(156, 30, 35, ${intensity * 0.4})`,
                        }}
                      >
                        {measure === CrossTabMeasure.COUNT
                          ? cell
                          : `${cell}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Total: {data.totalN.toLocaleString()} submissions
        </p>
      </CardContent>
    </Card>
  );
}

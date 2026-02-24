/**
 * LGA Comparison Table
 *
 * Story 5.6b AC3: Displays per-LGA aggregated stats with 12 columns.
 * Includes checkbox selection for comparison mode, supervisorless highlighting,
 * staffing model badges, and sort indicators.
 */

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import type { LgaProductivityRow, ProductivityTrend } from '@oslsr/types';
import { Badge } from '../../../components/ui/badge';

interface LgaComparisonTableProps {
  data: LgaProductivityRow[];
  summary: { totalLgas: number; totalSubmissions: number; overallPercent: number; supervisorlessCount: number };
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  selectedLgaIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

function TrendIndicator({ trend }: { trend: ProductivityTrend }) {
  if (trend === 'up') return <ArrowUp className="h-4 w-4 text-green-600" data-testid="trend-up" />;
  if (trend === 'down') return <ArrowDown className="h-4 w-4 text-red-600" data-testid="trend-down" />;
  return <ArrowRight className="h-4 w-4 text-neutral-400" data-testid="trend-flat" />;
}

function ProgressBar({ percent }: { percent: number }) {
  const width = Math.min(percent, 100);
  const color = percent >= 100 ? 'bg-green-500' : 'bg-[#9C1E23]';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-neutral-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-medium">{percent}%</span>
    </div>
  );
}

function RejRateCell({ rate }: { rate: number }) {
  const color = rate > 20 ? 'text-red-600' : rate > 10 ? 'text-amber-600' : 'text-green-600';
  return <span className={`font-medium ${color}`}>{rate}%</span>;
}

function StaffingModelBadge({ model, hasSupervisor }: { model: string; hasSupervisor: boolean }) {
  const className = !hasSupervisor
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : model.startsWith('Full')
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';
  return <Badge variant="outline" className={className} data-testid="staffing-model-badge">{model}</Badge>;
}

const MAX_COMPARISON = 5;

export default function LgaComparisonTable({
  data,
  summary,
  sorting,
  onSortingChange,
  selectedLgaIds,
  onSelectionChange,
}: LgaComparisonTableProps) {
  const toggleSelection = (lgaId: string) => {
    const next = new Set(selectedLgaIds);
    if (next.has(lgaId)) {
      next.delete(lgaId);
    } else if (next.size < MAX_COMPARISON) {
      next.add(lgaId);
    }
    onSelectionChange(next);
  };

  const columns = useMemo<ColumnDef<LgaProductivityRow>[]>(() => [
    {
      id: 'select',
      header: '',
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedLgaIds.has(row.original.lgaId)}
          onChange={() => toggleSelection(row.original.lgaId)}
          disabled={!selectedLgaIds.has(row.original.lgaId) && selectedLgaIds.size >= MAX_COMPARISON}
          className="h-4 w-4 rounded border-neutral-300"
          data-testid={`lga-checkbox-${row.original.lgaId}`}
        />
      ),
      size: 40,
    },
    {
      accessorKey: 'lgaName',
      header: 'LGA',
      cell: ({ row }) => (
        <span className={`font-medium ${!row.original.hasSupervisor ? 'text-amber-700' : ''}`}>
          {row.original.lgaName}
          {!row.original.hasSupervisor && (
            <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-700 border-amber-200 text-[10px]" data-testid="no-supervisor-badge">
              No Supervisor
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'staffingModel',
      header: 'Staffing Model',
      cell: ({ row }) => <StaffingModelBadge model={row.original.staffingModel} hasSupervisor={row.original.hasSupervisor} />,
    },
    {
      accessorKey: 'enumeratorCount',
      header: 'Enumerators',
      cell: ({ row }) => <span className="font-mono">{row.original.enumeratorCount}</span>,
    },
    {
      accessorKey: 'supervisorName',
      header: 'Supervisor',
      cell: ({ row }) => {
        if (!row.original.hasSupervisor) return <span className="text-amber-600 font-medium">— Super Admin</span>;
        return <span>{row.original.supervisorName}</span>;
      },
    },
    {
      accessorKey: 'todayTotal',
      header: 'Today Total',
      cell: ({ row }) => <span className="font-mono">{row.original.todayTotal}</span>,
    },
    {
      accessorKey: 'lgaTarget',
      header: 'LGA Target',
      cell: ({ row }) => <span className="font-mono text-neutral-500">{row.original.lgaTarget}</span>,
    },
    {
      accessorKey: 'percent',
      header: '%',
      cell: ({ row }) => <ProgressBar percent={row.original.percent} />,
    },
    {
      accessorKey: 'avgPerEnumerator',
      header: 'Avg/Enum.',
      cell: ({ row }) => <span className="font-mono">{row.original.avgPerEnumerator}</span>,
    },
    {
      id: 'bestPerformer',
      header: 'Best Performer',
      cell: ({ row }) => {
        const bp = row.original.bestPerformer;
        if (!bp) return <span className="text-neutral-400">—</span>;
        return <span className="text-green-700">{bp.name} ({bp.count})</span>;
      },
    },
    {
      id: 'lowestPerformer',
      header: 'Lowest Performer',
      cell: ({ row }) => {
        const lp = row.original.lowestPerformer;
        if (!lp) return <span className="text-neutral-400">—</span>;
        return <span className="text-red-600">{lp.name} ({lp.count})</span>;
      },
    },
    {
      accessorKey: 'rejRate',
      header: 'Rej. Rate',
      cell: ({ row }) => <RejRateCell rate={row.original.rejRate} />,
    },
    {
      id: 'trend',
      header: 'Trend',
      cell: ({ row }) => <TrendIndicator trend={row.original.trend} />,
    },
  ], [selectedLgaIds, toggleSelection]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: { sorting },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
  });

  return (
    <div data-testid="lga-comparison-table">
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm" role="table">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} role="row">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 whitespace-nowrap cursor-pointer select-none"
                    onClick={header.id !== 'select' ? header.column.getToggleSortingHandler() : undefined}
                    role="columnheader"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ArrowUp className="h-3 w-3" />}
                      {header.column.getIsSorted() === 'desc' && <ArrowDown className="h-3 w-3" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                  !row.original.hasSupervisor ? 'bg-amber-50' : ''
                } ${selectedLgaIds.has(row.original.lgaId) ? 'ring-1 ring-inset ring-[#9C1E23]/30' : ''}`}
                role="row"
                data-testid={!row.original.hasSupervisor ? 'supervisorless-row' : 'lga-row'}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-neutral-400">
                  No LGA data available for the selected filters.
                </td>
              </tr>
            )}
          </tbody>

          {data.length > 0 && (
            <tfoot data-testid="summary-row">
              <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-semibold text-sm">
                <td className="px-3 py-2" />
                <td className="px-3 py-2">{summary.totalLgas} LGAs</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 font-mono">{summary.totalSubmissions}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">
                  <ProgressBar percent={summary.overallPercent} />
                </td>
                <td className="px-3 py-2" colSpan={5}>
                  {summary.supervisorlessCount > 0 && (
                    <span className="text-amber-600">{summary.supervisorlessCount} supervisorless LGA{summary.supervisorlessCount > 1 ? 's' : ''}</span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

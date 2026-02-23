/**
 * ProductivityTable Component
 *
 * Story 5.6a: Displays team productivity data with 13 columns,
 * status badges, trend indicators, and summary row.
 * Uses @tanstack/react-table in server-side mode.
 */

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { StaffProductivityRow, ProductivitySummary, ProductivityStatus, ProductivityTrend } from '@oslsr/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

interface ProductivityTableProps {
  data: StaffProductivityRow[];
  summary: ProductivitySummary;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Status badge color mapping per AC #4 */
function StatusBadge({ status }: { status: ProductivityStatus }) {
  const config: Record<ProductivityStatus, { label: string; className: string }> = {
    complete: { label: 'Complete', className: 'bg-green-100 text-green-700 border-green-200' },
    on_track: { label: 'On Track', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    behind: { label: 'Behind', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    inactive: { label: 'Inactive', className: 'bg-red-100 text-red-700 border-red-200' },
  };

  const { label, className } = config[status] ?? config.behind;
  return <Badge variant="outline" className={className} data-testid={`status-badge-${status}`}>{label}</Badge>;
}

/** Trend arrow indicator */
function TrendIndicator({ trend }: { trend: ProductivityTrend }) {
  if (trend === 'up') return <ArrowUp className="h-4 w-4 text-green-600" data-testid="trend-up" />;
  if (trend === 'down') return <ArrowDown className="h-4 w-4 text-red-600" data-testid="trend-down" />;
  return <ArrowRight className="h-4 w-4 text-neutral-400" data-testid="trend-flat" />;
}

/** Progress bar for percentage */
function ProgressBar({ percent }: { percent: number }) {
  const width = Math.min(percent, 100);
  const color = percent >= 100 ? 'bg-green-500' : 'bg-[#9C1E23]';
  return (
    <div className="flex items-center gap-2" data-testid="progress-bar">
      <div className="h-2 w-16 rounded-full bg-neutral-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-medium">{percent}%</span>
    </div>
  );
}

/** Rejection rate with conditional coloring */
function RejRateCell({ rate }: { rate: number }) {
  const color = rate > 20 ? 'text-red-600' : rate > 10 ? 'text-amber-600' : 'text-green-600';
  return <span className={`font-medium ${color}`}>{rate}%</span>;
}

/** Relative time display for "Last Active" */
function RelativeTime({ isoDate }: { isoDate: string | null }) {
  if (!isoDate) return <span className="text-neutral-400">Never</span>;
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return <span>Just now</span>;
  if (mins < 60) return <span>{mins}m ago</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span>{hrs}h ago</span>;
  const days = Math.floor(hrs / 24);
  return <span>{days}d ago</span>;
}

export default function ProductivityTable({
  data,
  summary,
  sorting,
  onSortingChange,
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: ProductivityTableProps) {
  const columns = useMemo<ColumnDef<StaffProductivityRow>[]>(() => [
    {
      accessorKey: 'fullName',
      header: 'Enumerator',
      cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
    },
    {
      accessorKey: 'todayCount',
      header: 'Today',
      cell: ({ row }) => <span className="font-mono">{row.original.todayCount}</span>,
    },
    {
      accessorKey: 'target',
      header: 'Target',
      cell: ({ row }) => <span className="font-mono text-neutral-500">{row.original.target}</span>,
    },
    {
      accessorKey: 'percent',
      header: '%',
      cell: ({ row }) => <ProgressBar percent={row.original.percent} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'trend',
      header: 'Trend',
      cell: ({ row }) => <TrendIndicator trend={row.original.trend} />,
    },
    {
      accessorKey: 'weekCount',
      header: 'This Week',
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.weekCount}<span className="text-neutral-400">/{row.original.weekTarget}</span>
        </span>
      ),
    },
    {
      accessorKey: 'monthCount',
      header: 'This Month',
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.monthCount}<span className="text-neutral-400">/{row.original.monthTarget}</span>
        </span>
      ),
    },
    {
      accessorKey: 'approvedCount',
      header: 'Approved',
      cell: ({ row }) => <span className="font-mono">{row.original.approvedCount}</span>,
    },
    {
      accessorKey: 'rejectedCount',
      header: 'Rejected',
      cell: ({ row }) => <span className="font-mono">{row.original.rejectedCount}</span>,
    },
    {
      accessorKey: 'rejRate',
      header: 'Rej. Rate',
      cell: ({ row }) => <RejRateCell rate={row.original.rejRate} />,
    },
    {
      accessorKey: 'daysActive',
      header: 'Days Active',
      cell: ({ row }) => <span className="font-mono">{row.original.daysActive}</span>,
    },
    {
      accessorKey: 'lastActiveAt',
      header: 'Last Active',
      cell: ({ row }) => <RelativeTime isoDate={row.original.lastActiveAt} />,
    },
  ], []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(totalItems / pageSize),
    state: {
      sorting,
      pagination: { pageIndex: page - 1, pageSize },
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
  });

  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <div data-testid="productivity-table">
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm" role="table">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} role="row">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 whitespace-nowrap cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
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
                className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                role="row"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          {/* Summary row */}
          <tfoot data-testid="summary-row">
            <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-semibold text-sm">
              <td className="px-3 py-2">Team Total</td>
              <td className="px-3 py-2 font-mono">{summary.totalSubmissions}</td>
              <td className="px-3 py-2 font-mono">{summary.totalTarget}</td>
              <td className="px-3 py-2">
                <ProgressBar percent={summary.overallPercent} />
              </td>
              <td className="px-3 py-2" colSpan={9}>
                <span className="text-green-600">{summary.completedCount} complete</span>
                {' / '}
                <span className="text-amber-600">{summary.behindCount} behind</span>
                {' / '}
                <span className="text-red-600">{summary.inactiveCount} inactive</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-4" data-testid="pagination-controls">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-neutral-200 px-2 py-1 text-sm"
            data-testid="page-size-select"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span>
            {Math.min((page - 1) * pageSize + 1, totalItems)}-{Math.min(page * pageSize, totalItems)} of {totalItems}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            data-testid="prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            data-testid="next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

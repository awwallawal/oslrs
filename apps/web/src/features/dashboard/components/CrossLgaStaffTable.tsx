/**
 * CrossLgaStaffTable Component
 *
 * Story 5.6b: Displays all-staff productivity across all LGAs.
 * 15 columns: Staff Name, Role, LGA, Supervisor, Today, Target, %, Status,
 * Trend, This Week, This Month, Approved, Rej. Rate, Days Active, Last Active.
 *
 * Supervisors show review throughput with distinct row styling.
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
import type {
  StaffProductivityRowExtended,
  ProductivitySummary,
  ProductivityStatus,
  ProductivityTrend,
} from '@oslsr/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

interface CrossLgaStaffTableProps {
  data: StaffProductivityRowExtended[];
  summary: ProductivitySummary & { supervisorlessLgaCount: number };
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

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

function TrendIndicator({ trend }: { trend: ProductivityTrend }) {
  if (trend === 'up') return <ArrowUp className="h-4 w-4 text-green-600" data-testid="trend-up" />;
  if (trend === 'down') return <ArrowDown className="h-4 w-4 text-red-600" data-testid="trend-down" />;
  return <ArrowRight className="h-4 w-4 text-neutral-400" data-testid="trend-flat" />;
}

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

function RejRateCell({ rate }: { rate: number }) {
  const color = rate > 20 ? 'text-red-600' : rate > 10 ? 'text-amber-600' : 'text-green-600';
  return <span className={`font-medium ${color}`}>{rate}%</span>;
}

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

const ROLE_LABELS: Record<string, string> = {
  enumerator: 'Enumerator',
  data_entry_clerk: 'Clerk',
  supervisor: 'Supervisor',
};

export default function CrossLgaStaffTable({
  data,
  summary,
  sorting,
  onSortingChange,
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: CrossLgaStaffTableProps) {
  const columns = useMemo<ColumnDef<StaffProductivityRowExtended>[]>(() => [
    {
      accessorKey: 'fullName',
      header: 'Staff Name',
      cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const role = row.original.role;
        const color = role === 'supervisor' ? 'bg-purple-100 text-purple-700 border-purple-200'
          : role === 'data_entry_clerk' ? 'bg-sky-100 text-sky-700 border-sky-200'
          : 'bg-neutral-100 text-neutral-700 border-neutral-200';
        return <Badge variant="outline" className={color} data-testid="role-badge">{ROLE_LABELS[role] ?? role}</Badge>;
      },
    },
    {
      accessorKey: 'lgaName',
      header: 'LGA',
      cell: ({ row }) => <span>{row.original.lgaName}</span>,
    },
    {
      accessorKey: 'supervisorName',
      header: 'Supervisor',
      cell: ({ row }) => {
        const name = row.original.supervisorName;
        if (row.original.role === 'supervisor') return <span className="text-neutral-400">—</span>;
        if (!name) return <span className="text-amber-600 font-medium">— Direct</span>;
        return <span>{name}</span>;
      },
    },
    {
      accessorKey: 'todayCount',
      header: 'Today',
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.todayCount}
          {row.original.role === 'supervisor' && (
            <span className="ml-1 text-xs text-purple-500">Reviews</span>
          )}
        </span>
      ),
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
          {row.original.weekCount}
          <span className="text-neutral-400">/{row.original.weekTarget}</span>
        </span>
      ),
    },
    {
      accessorKey: 'monthCount',
      header: 'This Month',
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.monthCount}
          <span className="text-neutral-400">/{row.original.monthTarget}</span>
        </span>
      ),
    },
    {
      accessorKey: 'approvedCount',
      header: 'Approved',
      cell: ({ row }) => <span className="font-mono">{row.original.approvedCount}</span>,
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
    <div data-testid="cross-lga-staff-table">
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
                className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                  row.original.role === 'supervisor' ? 'bg-purple-50/40' : ''
                }`}
                role="row"
                data-testid={row.original.role === 'supervisor' ? 'supervisor-row' : 'staff-row'}
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
                <td colSpan={15} className="px-4 py-8 text-center text-neutral-400">
                  No staff data available for the selected filters.
                </td>
              </tr>
            )}
          </tbody>

          {data.length > 0 && (
            <tfoot data-testid="summary-row">
              <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-semibold text-sm">
                <td className="px-3 py-2">All Staff Total</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 font-mono">{summary.totalSubmissions}</td>
                <td className="px-3 py-2 font-mono">{summary.totalTarget}</td>
                <td className="px-3 py-2">
                  <ProgressBar percent={summary.overallPercent} />
                </td>
                <td className="px-3 py-2" colSpan={8}>
                  <span className="text-green-600">{summary.completedCount} complete</span>
                  {' / '}
                  <span className="text-amber-600">{summary.behindCount} behind</span>
                  {' / '}
                  <span className="text-red-600">{summary.inactiveCount} inactive</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
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
          <span className="px-2 text-sm">Page {page} of {totalPages || 1}</span>
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

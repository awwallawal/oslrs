/**
 * RespondentRegistryTable â€” Server-side paginated table with TanStack Table v8
 *
 * Story 5.5 Task 5: Role-based column visibility, sortable headers, row click navigation.
 * Uses @tanstack/react-table in manual (server-side) mode.
 */

import { useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { SkeletonTable } from '../../../components/skeletons/SkeletonTable';
import type { RespondentListItem } from '@oslsr/types';

// â”€â”€ Verification Status Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unprocessed: { label: 'Unprocessed', className: 'bg-gray-100 text-gray-600' },
  processing_error: { label: 'Error', className: 'bg-red-100 text-red-700' },
  auto_clean: { label: 'Auto Clean', className: 'bg-green-100 text-green-700' },
  pending_review: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
  flagged: { label: 'Flagged', className: 'bg-red-100 text-red-700' },
  under_audit: { label: 'Under Audit', className: 'bg-blue-100 text-blue-700' },
  verified: { label: 'Verified', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-200 text-red-900' },
};

function VerificationStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// â”€â”€ Source label helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function sourceLabel(source: string): string {
  switch (source) {
    case 'enumerator':
      return 'Enumerator';
    case 'public':
      return 'Public';
    case 'clerk':
      return 'Clerk';
    default:
      return source;
  }
}

// â”€â”€ Column Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildColumns(): ColumnDef<RespondentListItem>[] {
  return [
    {
      accessorKey: 'firstName',
      header: 'Surname, First Name',
      cell: ({ row }) => {
        const { firstName, lastName } = row.original;
        if (!firstName && !lastName) return '—';
        if (lastName && firstName) return `${lastName}, ${firstName}`;
        return `${lastName ?? firstName ?? ''}`;
      },
      enableSorting: false,
    },
    {
      accessorKey: 'nin',
      header: 'NIN',
      cell: ({ getValue }) => getValue() ?? '-',
      enableSorting: false,
    },
    {
      accessorKey: 'phoneNumber',
      header: 'Phone',
      cell: ({ getValue }) => getValue() ?? '-',
      enableSorting: false,
    },
    {
      accessorKey: 'gender',
      header: 'Gender',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? v.charAt(0).toUpperCase() + v.slice(1) : '-';
      },
      enableSorting: false,
    },
    {
      accessorKey: 'lgaName',
      header: 'LGA',
      cell: ({ getValue }) => getValue() ?? '-',
      enableSorting: true,
    },
    {
      accessorKey: 'source',
      header: 'Channel',
      cell: ({ getValue }) => sourceLabel(getValue() as string),
      enableSorting: false,
    },
    {
      accessorKey: 'enumeratorName',
      header: 'Enumerator',
      cell: ({ row }) => {
        const { enumeratorName, source } = row.original;
        if (enumeratorName) return enumeratorName;
        return source === 'enumerator' ? '-' : 'N/A';
      },
      enableSorting: false,
    },
    {
      accessorKey: 'formName',
      header: 'Form',
      cell: ({ getValue }) => getValue() ?? '-',
      enableSorting: false,
    },
    {
      accessorKey: 'verificationStatus',
      header: 'Status',
      cell: ({ getValue }) => <VerificationStatusBadge status={getValue() as string} />,
      enableSorting: true,
    },
  ];
}

/** Get column visibility state based on user role */
function getColumnVisibility(userRole: string): VisibilityState {
  const isSupervisor = userRole === 'supervisor';
  return {
    firstName: !isSupervisor,
    nin: !isSupervisor,
    phoneNumber: !isSupervisor,
  };
}

// â”€â”€ Sort Header Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SortIcon({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc' } }) {
  const sorted = column.getIsSorted();
  if (sorted === 'asc') return <ChevronUp className="w-4 h-4 ml-1" />;
  if (sorted === 'desc') return <ChevronDown className="w-4 h-4 ml-1" />;
  return <ChevronsUpDown className="w-4 h-4 ml-1 text-gray-400" />;
}

// â”€â”€ Table Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RespondentRegistryTableProps {
  data: RespondentListItem[];
  isLoading: boolean;
  userRole: string;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  pagination: {
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export function RespondentRegistryTable({
  data,
  isLoading,
  userRole,
  sorting,
  onSortingChange,
  pagination,
  onNextPage,
  onPreviousPage,
  pageSize,
  onPageSizeChange,
}: RespondentRegistryTableProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the role's dashboard base path from current URL
  const roleBasePath = useMemo(() => {
    const parts = location.pathname.split('/');
    return parts.slice(0, 3).join('/');
  }, [location.pathname]);

  const columns = useMemo(() => {
    const base = buildColumns();
    // Append actions column with eye icon for quick-view
    const actionsColumn: ColumnDef<RespondentListItem> = {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`${roleBasePath}/respondent/${row.original.id}?viewSubmission=latest`);
          }}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
          data-testid={`quick-view-${row.original.id}`}
          title="View latest submission"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
      enableSorting: false,
    };
    return [...base, actionsColumn];
  }, [navigate, roleBasePath]);
  const columnVisibility = useMemo(() => getColumnVisibility(userRole), [userRole]);

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(next);
    },
  });

  const handleRowClick = useCallback(
    (respondentId: string) => {
      navigate(`${roleBasePath}/respondent/${respondentId}`);
    },
    [navigate, roleBasePath],
  );

  if (isLoading) {
    const colCount = userRole === 'supervisor' ? 7 : 10;
    return <SkeletonTable columns={colCount} rows={pageSize} data-testid="registry-table-skeleton" />;
  }

  return (
    <div data-testid="registry-table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-3 py-2 text-left font-medium text-gray-600 ${
                      header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-900' : ''
                    }`}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="flex items-center">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <SortIcon column={header.column} />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleFlatColumns().length}
                  className="px-3 py-12 text-center text-gray-500"
                >
                  No respondents found matching the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row.original.id)}
                  className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                  data-testid={`registry-row-${row.original.id}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-3 py-2.5 ${
                        cell.column.id === 'firstName'
                          ? 'whitespace-normal min-w-[240px] max-w-[360px]'
                          : 'whitespace-nowrap'
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-3 py-3 border-t border-gray-200" data-testid="pagination-controls">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded border border-gray-300 bg-white px-2 text-sm"
            data-testid="page-size-select"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviousPage}
            disabled={!pagination.hasPreviousPage}
            data-testid="prev-page"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={!pagination.hasNextPage}
            data-testid="next-page"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}





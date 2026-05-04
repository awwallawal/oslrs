/**
 * Story 9-11 AC#4 — Audit Log Results Table.
 *
 * Renders rows from the AC#9 list endpoint. Columns: Timestamp / Principal /
 * Action / Target Resource / Target ID / Outcome.
 *
 * Sort: server returns rows in `created_at DESC, id DESC` order (the only stable
 * ordering for cursor pagination). The column-header sort indicator on
 * Timestamp reflects this. Principal and Action headers expose a *client-side*
 * sort over the visible page only; cross-page sort would require composite
 * cursors and is out of scope for v1 (logged in story Dev Agent Record).
 *
 * Row click invokes `onRowClick(row)` — the page mounts the detail drawer.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Server, User as UserIcon } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import type { AuditLogRow } from '../api/audit-log.api';

type SortColumn = 'timestamp' | 'principal' | 'action';
type SortDirection = 'asc' | 'desc';

const NO_VALUE = '—';

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncateId(id: string | null): string {
  if (!id) return NO_VALUE;
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

interface OutcomeInfo {
  label: string;
  classes: string;
}

function inferOutcome(details: unknown): OutcomeInfo {
  if (details && typeof details === 'object' && details !== null) {
    const candidate = (details as Record<string, unknown>).status_code;
    // R3-M4: log unexpected status_code shapes so future drift surfaces in
    // dev console rather than silently degrading to "—". Skip nullish (no
    // status code emitted is legitimate for many actions); skip numbers (the
    // happy path); flag everything else.
    if (candidate != null && typeof candidate !== 'number' && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[audit-log] inferOutcome: unexpected status_code shape',
        { type: typeof candidate, value: candidate }
      );
    }
    const status = typeof candidate === 'number' ? candidate : Number.NaN;
    if (Number.isFinite(status)) {
      if (status >= 200 && status < 400) {
        return { label: 'Success', classes: 'bg-green-50 text-green-700 ring-green-200' };
      }
      if (status >= 400) {
        return { label: 'Failure', classes: 'bg-red-50 text-red-700 ring-red-200' };
      }
    }
  }
  return { label: NO_VALUE, classes: 'bg-neutral-50 text-neutral-500 ring-neutral-200' };
}

function principalIcon(type: AuditLogRow['principalType']) {
  if (type === 'user')
    return <UserIcon className="h-3.5 w-3.5 text-neutral-500" aria-hidden />;
  if (type === 'consumer')
    return <Server className="h-3.5 w-3.5 text-neutral-500" aria-hidden />;
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full bg-neutral-300"
      aria-hidden
    />
  );
}

export interface AuditLogResultsTableProps {
  rows: AuditLogRow[];
  isLoading: boolean;
  onRowClick: (row: AuditLogRow) => void;
}

export default function AuditLogResultsTable({
  rows,
  isLoading,
  onRowClick,
}: AuditLogResultsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedRows = useMemo(() => {
    if (sortColumn === 'timestamp' && sortDirection === 'desc') {
      // Server already returns rows in this order — skip the resort.
      return rows;
    }
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortColumn === 'timestamp') {
        av = a.createdAt;
        bv = b.createdAt;
      } else if (sortColumn === 'principal') {
        av = a.principalName.toLowerCase();
        bv = b.principalName.toLowerCase();
      } else {
        av = a.action.toLowerCase();
        bv = b.action.toLowerCase();
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'timestamp' ? 'desc' : 'asc');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="results-table-skeleton">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-md border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500"
        data-testid="results-table-empty"
      >
        No audit events match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
      <table className="w-full text-sm" data-testid="audit-log-results-table">
        <thead className="bg-neutral-50 text-left">
          <tr className="border-b border-neutral-200">
            <SortableHeader
              label="Timestamp"
              column="timestamp"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
              className="w-44"
            />
            <SortableHeader
              label="Principal"
              column="principal"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
              className="w-56"
            />
            <SortableHeader
              label="Action"
              column="action"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
              className="w-44"
            />
            <th className="px-3 py-2 font-medium text-neutral-700">Target Resource</th>
            <th className="px-3 py-2 font-medium text-neutral-700">Target ID</th>
            <th className="px-3 py-2 font-medium text-neutral-700">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const outcome = inferOutcome(row.details);
            return (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 focus:bg-neutral-100 focus:outline-none"
                onClick={() => onRowClick(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Audit event ${row.action} at ${row.createdAt}`}
                data-testid={`audit-log-row-${row.id}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                  {formatTimestamp(row.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    {principalIcon(row.principalType)}
                    <span className="truncate">{row.principalName}</span>
                  </span>
                </td>
                <td className="px-3 py-2 font-medium text-neutral-800">{row.action}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {row.targetResource ?? NO_VALUE}
                </td>
                <td
                  className="px-3 py-2 font-mono text-xs text-neutral-500"
                  title={row.targetId ?? undefined}
                >
                  {truncateId(row.targetId)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${outcome.classes}`}
                  >
                    {outcome.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = activeColumn === column;
  return (
    <th className={`px-3 py-2 font-medium text-neutral-700 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:text-neutral-900 focus:outline-none focus-visible:underline"
        aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        data-testid={`sort-header-${column}`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
        )}
      </button>
    </th>
  );
}

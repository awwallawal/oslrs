/**
 * Story 9-11 AC#1, #2, #5, #6, #8 — Audit Log Page (Super Admin only).
 *
 * Composes the four feature components:
 *   - AuditLogFilter (sidebar / sheet)
 *   - AuditLogResultsTable
 *   - AuditLogDetailDrawer
 *   - "Export CSV" button (AC#8)
 *
 * URL-routed filter state (AC#6): query params drive the filter. Cursor is the
 * one server-side pagination axis the URL carries — sharing a URL puts the
 * recipient on that page, with the access policy (super_admin only) enforced
 * at the API layer regardless.
 *
 * Pagination history: maintained in a local stack so Previous can pop without
 * round-tripping the server. First/Previous/Next; no "Last" because cursor
 * pagination has no constant-time end (would need a server count parameter).
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Download,
  Filter as FilterIcon,
  ScrollText,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../../components/ui/sheet';
import AuditLogFilter from '../components/AuditLogFilter';
import AuditLogResultsTable from '../components/AuditLogResultsTable';
import AuditLogDetailDrawer from '../components/AuditLogDetailDrawer';
import { useAuditLogs, useExportAuditLog } from '../hooks/useAuditLogs';
import type {
  AuditLogFilter as AuditLogFilterValue,
  AuditLogRow,
  PrincipalType,
} from '../api/audit-log.api';
import { ApiError } from '../../../lib/api-client';

const PRINCIPAL_VALUES: PrincipalType[] = ['user', 'consumer', 'system'];

function parsePrincipalParam(value: string | null): PrincipalType[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is PrincipalType =>
      PRINCIPAL_VALUES.includes(p as PrincipalType),
    );
  if (parts.length === 0 || parts.length === PRINCIPAL_VALUES.length) {
    return undefined;
  }
  return parts;
}

function parseListParam(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length === 0 ? undefined : parts;
}

function filterFromSearchParams(params: URLSearchParams): AuditLogFilterValue {
  return {
    principalTypes: parsePrincipalParam(params.get('principal')),
    actorId: params.get('actorId') ?? undefined,
    actions: parseListParam(params.get('action')),
    targetResource: params.get('targetResource') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    cursor: params.get('cursor') ?? undefined,
  };
}

function applyFilterToSearchParams(
  prev: URLSearchParams,
  filter: AuditLogFilterValue,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const setOrDelete = (key: string, value: string | undefined) => {
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
  };
  setOrDelete(
    'principal',
    filter.principalTypes && filter.principalTypes.length > 0
      ? filter.principalTypes.join(',')
      : undefined,
  );
  setOrDelete('actorId', filter.actorId);
  setOrDelete(
    'action',
    filter.actions && filter.actions.length > 0
      ? filter.actions.join(',')
      : undefined,
  );
  setOrDelete('targetResource', filter.targetResource);
  setOrDelete('from', filter.from);
  setOrDelete('to', filter.to);
  setOrDelete('cursor', filter.cursor);
  return next;
}

function triggerCsvDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export default function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => filterFromSearchParams(searchParams), [searchParams]);

  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [activeRow, setActiveRow] = useState<AuditLogRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const queryFilter = useMemo<AuditLogFilterValue>(
    () => ({ ...filter, limit: 100 }),
    [filter],
  );

  const { data, isLoading, isFetching, isError, error, refetch } =
    useAuditLogs(queryFilter);
  const exportMutation = useExportAuditLog();

  const rows = data?.rows ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const pageNumber = cursorStack.length + 1;

  const handleApply = useCallback(
    (next: AuditLogFilterValue) => {
      setSearchParams(
        (prev) => applyFilterToSearchParams(prev, { ...next, cursor: undefined }),
        { replace: false },
      );
      setCursorStack([]);
    },
    [setSearchParams],
  );

  const handleReset = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
    setCursorStack([]);
  }, [setSearchParams]);

  const goNext = () => {
    if (!nextCursor) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('cursor', nextCursor);
        return next;
      },
      { replace: false },
    );
    setCursorStack((prev) => [...prev, filter.cursor ?? '']);
  };

  const goPrevious = () => {
    if (cursorStack.length === 0) return;
    const previousCursor = cursorStack[cursorStack.length - 1];
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (previousCursor) {
          next.set('cursor', previousCursor);
        } else {
          next.delete('cursor');
        }
        return next;
      },
      { replace: false },
    );
    setCursorStack((prev) => prev.slice(0, -1));
  };

  const goFirst = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cursor');
        return next;
      },
      { replace: false },
    );
    setCursorStack([]);
  };

  const handleRowClick = (row: AuditLogRow) => {
    setActiveRow(row);
    setDrawerOpen(true);
  };

  const handleCrossReference = (
    principalId: string,
    principalType: PrincipalType,
    /**
     * R3-M3: anchor the 7-day cross-reference window to the *clicked* event's
     * timestamp instead of `Date.now()`. Without this anchor, clicking
     * "View all events from this principal" on an event from 8+ days ago
     * caused the resulting filter to start 7 days before the present moment,
     * meaning the very event the user clicked on disappeared from the
     * cross-reference results — confusing UX.
     *
     * Defaults to `Date.now()` to preserve the prior behaviour for callsites
     * that don't have an event timestamp handy (none currently — all known
     * callsites pass the clicked row's `createdAt`).
     */
    anchorIsoTs?: string,
  ) => {
    const anchorMs = anchorIsoTs ? new Date(anchorIsoTs).getTime() : Date.now();
    const validAnchorMs = Number.isFinite(anchorMs) ? anchorMs : Date.now();
    const windowStart = new Date(validAnchorMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Window upper bound is the clicked event's timestamp + a small buffer so the
    // event itself remains visible (server filter is inclusive on both ends).
    const windowEnd = anchorIsoTs
      ? new Date(validAnchorMs + 60 * 1000).toISOString() // +1 min buffer
      : undefined;
    handleApply({
      principalTypes: principalType === 'system' ? undefined : [principalType],
      actorId: principalId,
      from: windowStart,
      to: windowEnd,
    });
    setDrawerOpen(false);
  };

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        principalTypes: filter.principalTypes,
        actorId: filter.actorId,
        actions: filter.actions,
        targetResource: filter.targetResource,
        from: filter.from,
        to: filter.to,
      });
      triggerCsvDownload(result.blob, result.filename);
      toast.success(`Export complete: ${result.rowCount.toLocaleString()} rows`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) {
        toast.error(
          'Export too large — refine filters or use the API for bulk export.',
        );
      } else if (err instanceof ApiError && err.status === 429) {
        toast.error('Export rate limit reached — try again in a few minutes.');
      } else {
        toast.error('Export failed. Please try again.');
      }
    }
  };

  return (
    <div className="flex h-full flex-col p-4 md:p-6" data-testid="audit-log-page">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-neutral-700" aria-hidden />
          <div>
            <h1 className="text-2xl font-brand font-semibold text-neutral-900">
              Audit Log
            </h1>
            <p className="text-sm text-neutral-600">
              All audit events across users, consumers, and system. Default view:
              last 24 hours.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile / tablet filter trigger */}
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                data-testid="filter-sheet-trigger"
              >
                <FilterIcon className="h-4 w-4" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-full max-w-sm sm:max-w-md"
              data-testid="filter-sheet"
            >
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto px-4 pb-6">
                <AuditLogFilter
                  value={filter}
                  onApply={handleApply}
                  onReset={handleReset}
                  onClose={() => setFilterSheetOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
            data-testid="export-csv-button"
          >
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 gap-6">
        {/* Desktop filter sidebar */}
        <aside
          className="hidden w-80 shrink-0 lg:block"
          data-testid="filter-sidebar"
          aria-label="Audit log filters"
        >
          <div className="sticky top-4 rounded-md border border-neutral-200 bg-white p-4">
            <AuditLogFilter
              value={filter}
              onApply={handleApply}
              onReset={handleReset}
            />
          </div>
        </aside>

        {/* Results column */}
        <section className="flex flex-1 flex-col gap-3 min-w-0">
          {isError && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              data-testid="results-error"
            >
              <p className="font-medium">Failed to load audit events.</p>
              <p className="mt-1 text-xs">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          )}

          <AuditLogResultsTable
            rows={rows}
            isLoading={isLoading}
            onRowClick={handleRowClick}
          />

          {/* Pagination */}
          <nav
            className="flex items-center justify-between border-t border-neutral-200 pt-3 text-sm"
            aria-label="Pagination"
            data-testid="pagination"
          >
            <span className="text-neutral-600">
              Page {pageNumber}
              {isFetching && !isLoading && (
                <span className="ml-2 text-xs text-neutral-400">Loading…</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={goFirst}
                disabled={cursorStack.length === 0}
                data-testid="pagination-first"
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
                First
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goPrevious}
                disabled={cursorStack.length === 0}
                data-testid="pagination-previous"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goNext}
                disabled={!nextCursor}
                data-testid="pagination-next"
                aria-label="Next page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </section>
      </div>

      <AuditLogDetailDrawer
        row={activeRow}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onPrincipalCrossReference={handleCrossReference}
      />
    </div>
  );
}

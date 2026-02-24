/**
 * SupervisorProductivityPage
 *
 * Story 5.6a: Team productivity table with filters, exports, and live refresh.
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Download, Users, Search, X, Calendar } from 'lucide-react';
import type { SortingState } from '@tanstack/react-table';
import type { ProductivityFilterParams } from '@oslsr/types';
import { useTeamProductivity, useProductivityExport, productivityKeys } from '../hooks/useProductivity';
import ProductivityTable from '../components/ProductivityTable';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { SkeletonTable } from '../../../components/skeletons';
import { useToast } from '../../../hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';

type Period = 'today' | 'week' | 'month' | 'custom';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'complete', label: 'Complete' },
  { value: 'on_track', label: 'On Track' },
  { value: 'behind', label: 'Behind' },
  { value: 'inactive', label: 'Inactive' },
];

export default function SupervisorProductivityPage() {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Filters
  const [period, setPeriod] = useState<Period>('today');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);

  const filters: ProductivityFilterParams = {
    period,
    status,
    search: search || undefined,
    ...(period === 'custom' && dateFrom ? { dateFrom } : {}),
    ...(period === 'custom' && dateTo ? { dateTo } : {}),
    sortBy: sorting[0]?.id ?? 'fullName',
    sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
    page,
    pageSize,
  };

  const { data: result, isLoading, isError } = useTeamProductivity(filters);
  const exportMutation = useProductivityExport();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: productivityKeys.all });
    setLastUpdated(new Date());
  }, [queryClient]);

  const handleExport = useCallback((format: 'csv' | 'pdf') => {
    exportMutation.mutate(
      { filters: { period, status, search: search || undefined }, format },
      {
        onSuccess: () => success({ message: `Productivity report exported as ${format.toUpperCase()}` }),
        onError: () => toastError({ message: 'Export failed. Please try again.' }),
      },
    );
  }, [exportMutation, period, status, search, success, toastError]);

  const handleClearFilters = useCallback(() => {
    setStatus('all');
    setSearch('');
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => setPage(newPage), []);
  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const handlePeriodChange = useCallback((newPeriod: Period) => {
    setPeriod(newPeriod);
    setPage(1);
  }, []);

  return (
    <div className="p-6 space-y-6" data-testid="productivity-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Team Productivity</h1>
          <p className="text-sm text-neutral-500">
            Track your team's submission output against daily targets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            data-testid="refresh-button"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      {result && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="summary-strip">
          <Card className="p-3">
            <p className="text-xs text-neutral-500">Total Submissions</p>
            <p className="text-xl font-bold">{result.summary.totalSubmissions}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-neutral-500">Avg per Enumerator</p>
            <p className="text-xl font-bold">{result.summary.avgPerDay}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-neutral-500">Team Completion</p>
            <p className="text-xl font-bold">{result.summary.overallPercent}%</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-neutral-500">Behind / Inactive</p>
            <p className="text-xl font-bold text-amber-600">
              {result.summary.behindCount + result.summary.inactiveCount}
            </p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 space-y-3">
        {/* Time range picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-600">Period:</span>
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePeriodChange(opt.value)}
              className={period === opt.value ? 'bg-[#9C1E23] hover:bg-[#7A171B] text-white' : ''}
              data-testid={`period-${opt.value}`}
            >
              {opt.value === 'custom' && <Calendar className="h-3.5 w-3.5 mr-1" />}
              {opt.label}
            </Button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2" data-testid="custom-date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
                data-testid="date-from"
              />
              <span className="text-sm text-neutral-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
                data-testid="date-to"
              />
            </div>
          )}
        </div>

        {/* Status filter + search + export */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
            data-testid="status-filter"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-md border border-neutral-200 pl-8 pr-8 py-1.5 text-sm"
              data-testid="search-input"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-neutral-400" />
              </button>
            )}
          </div>

          {(status !== 'all' || search) && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="clear-filters">
              Clear
            </Button>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={exportMutation.isPending}
              data-testid="export-csv"
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={exportMutation.isPending}
              data-testid="export-pdf"
            >
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>
      </Card>

      {/* Table or loading/empty/error states */}
      {isLoading && (
        <Card className="p-4">
          <SkeletonTable rows={5} columns={13} />
        </Card>
      )}

      {isError && (
        <Card className="p-8 text-center">
          <p className="text-red-600 font-medium">Failed to load productivity data</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
            Try Again
          </Button>
        </Card>
      )}

      {result && result.data.length === 0 && !isLoading && (
        <Card className="p-8 text-center" data-testid="empty-state">
          <Users className="mx-auto h-12 w-12 text-neutral-300 mb-3" />
          <p className="text-neutral-600 font-medium">No team members assigned</p>
          <p className="text-sm text-neutral-400 mt-1">Contact your administrator to assign enumerators to your team.</p>
        </Card>
      )}

      {result && result.data.length > 0 && (
        <ProductivityTable
          data={result.data}
          summary={result.summary}
          sorting={sorting}
          onSortingChange={setSorting}
          page={page}
          pageSize={pageSize}
          totalItems={result.meta.pagination.totalItems}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}

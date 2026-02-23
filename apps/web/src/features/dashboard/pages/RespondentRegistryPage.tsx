/**
 * RespondentRegistryPage — Server-paginated, filterable respondent registry
 *
 * Story 5.5 Task 9: Main page composing QuickFilterPresets, RegistryFilters,
 * RespondentRegistryTable, ExportButton, and live monitoring.
 * Shared by 4 roles: Super Admin, Verification Assessor, Government Official, Supervisor.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { SortingState } from '@tanstack/react-table';
import { Database, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../auth/context/AuthContext';
import { useRespondentList } from '../hooks/useRespondent';
import { useLiveMonitoring } from '../hooks/useLiveMonitoring';
import { QuickFilterPresets, PRESETS } from '../components/QuickFilterPresets';
import { RegistryFilters } from '../components/RegistryFilters';
import { RespondentRegistryTable } from '../components/RespondentRegistryTable';
import { ExportButton } from '../components/ExportButton';
import type { RespondentFilterParams } from '@oslsr/types';
import type { ExportFilters } from '../api/export.api';

export default function RespondentRegistryPage() {
  const { user } = useAuth();
  const location = useLocation();
  const userRole = user?.role ?? 'public_user';
  const isOfficialRoute = location.pathname.includes('/official/');

  // ── Filter + Pagination State ──────────────────────────────────
  const [filters, setFilters] = useState<RespondentFilterParams>({
    pageSize: 20,
    sortBy: 'registeredAt',
    sortOrder: 'desc',
  });
  const [activePreset, setActivePreset] = useState<string | null>('all');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'registeredAt', desc: true },
  ]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  // ── Live Monitoring ────────────────────────────────────────────
  const { refetchInterval, isLiveMode, lastUpdated, setLastUpdated, newCount, setNewCount } =
    useLiveMonitoring(activePreset);

  // ── Data Fetch ─────────────────────────────────────────────────
  const { data: response, isLoading, dataUpdatedAt } = useRespondentList(filters, {
    refetchInterval,
  });

  // Track new submissions in live mode
  const prevTotalRef = useRef<number>(0);
  useEffect(() => {
    if (response?.meta?.pagination?.totalItems !== undefined) {
      const current = response.meta.pagination.totalItems;
      if (prevTotalRef.current > 0 && current > prevTotalRef.current && isLiveMode) {
        setNewCount(current - prevTotalRef.current);
      }
      prevTotalRef.current = current;
    }
    if (dataUpdatedAt) {
      setLastUpdated(new Date(dataUpdatedAt));
    }
  }, [response, dataUpdatedAt, isLiveMode, setNewCount, setLastUpdated]);

  // ── Preset Handler ─────────────────────────────────────────────
  const handlePresetChange = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      setActivePreset(preset.key);
      setCursorStack([]);
      setNewCount(0);
      setFilters({
        ...preset.getFilters(),
        pageSize: filters.pageSize,
        sortBy: preset.sort.sortBy,
        sortOrder: preset.sort.sortOrder,
      });
      setSorting([{ id: preset.sort.sortBy, desc: preset.sort.sortOrder === 'desc' }]);
    },
    [filters.pageSize, setNewCount],
  );

  // ── Filter Change Handler ──────────────────────────────────────
  const handleFilterChange = useCallback(
    (newFilters: RespondentFilterParams) => {
      setActivePreset(null); // Deselect preset on manual filter change
      setCursorStack([]);
      setFilters(newFilters);
    },
    [],
  );

  // ── Sorting Handler ────────────────────────────────────────────
  const handleSortingChange = useCallback(
    (newSorting: SortingState) => {
      setSorting(newSorting);
      setActivePreset(null);
      setCursorStack([]);
      if (newSorting.length > 0) {
        const col = newSorting[0];
        setFilters((prev) => ({
          ...prev,
          sortBy: col.id as RespondentFilterParams['sortBy'],
          sortOrder: col.desc ? 'desc' : 'asc',
          cursor: undefined,
        }));
      }
    },
    [],
  );

  // ── Pagination Handlers ────────────────────────────────────────
  const handleNextPage = useCallback(() => {
    if (response?.meta?.pagination?.nextCursor) {
      setCursorStack((prev) => [...prev, filters.cursor || '']);
      setFilters((prev) => ({
        ...prev,
        cursor: response.meta.pagination.nextCursor!,
      }));
    }
  }, [response, filters.cursor]);

  const handlePreviousPage = useCallback(() => {
    setCursorStack((prev) => {
      const stack = [...prev];
      const prevCursor = stack.pop();
      setFilters((f) => ({ ...f, cursor: prevCursor || undefined }));
      return stack;
    });
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setCursorStack([]);
    setFilters((prev) => ({ ...prev, pageSize: size, cursor: undefined }));
  }, []);

  // ── Export Integration ─────────────────────────────────────────
  const exportFilters: ExportFilters = useMemo(
    () => ({
      lgaId: filters.lgaId,
      source: filters.source,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      severity: filters.severity,
      verificationStatus: filters.verificationStatus,
    }),
    [filters],
  );

  // ── Last Updated Display (ticking counter) ────────────────────
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => {
    if (!isLiveMode) {
      setSecondsAgo(null);
      return;
    }
    const tick = () => setSecondsAgo(Math.round((Date.now() - lastUpdated.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLiveMode, lastUpdated]);

  const totalItems = response?.meta?.pagination?.totalItems ?? 0;
  const paginationMeta = response?.meta?.pagination ?? {
    pageSize: filters.pageSize ?? 20,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  return (
    <div className="space-y-4" data-testid="respondent-registry-page">
      {/* Header */}
      <div
        className={`flex items-center justify-between ${
          isOfficialRoute ? 'bg-gray-800 text-white px-4 py-3 rounded-lg' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          <h1
            className={`text-lg font-semibold ${isOfficialRoute ? 'uppercase tracking-wide' : ''}`}
          >
            Respondent Registry
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-sm text-gray-500">{totalItems.toLocaleString()} records</span>
          )}
          <ExportButton filters={exportFilters} />
        </div>
      </div>

      {/* Quick Filter Presets */}
      <QuickFilterPresets
        activePreset={activePreset}
        onPresetChange={handlePresetChange}
        isOfficialRoute={isOfficialRoute}
      />

      {/* Live Monitoring Bar */}
      {isLiveMode && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2" data-testid="live-monitor">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Auto-refreshing every 60s</span>
            {secondsAgo !== null && (
              <span className="text-blue-500">Last updated: {secondsAgo}s ago</span>
            )}
          </div>
          {newCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setNewCount(0);
                setCursorStack([]);
                setFilters((prev) => ({ ...prev, cursor: undefined }));
              }}
              className="text-sm font-medium text-blue-700 hover:underline"
              data-testid="new-submissions-bar"
            >
              {newCount} new submission{newCount > 1 ? 's' : ''} — Click to refresh
            </button>
          )}
        </div>
      )}

      {/* Collapsible Filters */}
      <div className={`${isOfficialRoute ? 'border-l-4 border-[#9C1E23]' : ''}`}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 px-2"
          data-testid="toggle-filters"
        >
          {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Filters
        </button>
        {filtersOpen && (
          <div className="mt-2 px-2">
            <RegistryFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              userRole={userRole}
              userLgaId={(user as { lgaId?: string })?.lgaId}
              isOfficialRoute={isOfficialRoute}
            />
          </div>
        )}
      </div>

      {/* Registry Table */}
      <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${isOfficialRoute ? 'bg-[#FAFAFA]' : ''}`}>
        <RespondentRegistryTable
          data={response?.data ?? []}
          isLoading={isLoading}
          userRole={userRole}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          pagination={{
            pageSize: paginationMeta.pageSize,
            hasNextPage: paginationMeta.hasNextPage,
            hasPreviousPage: cursorStack.length > 0,
          }}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          pageSize={filters.pageSize ?? 20}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
}

/**
 * Super Admin Cross-LGA Productivity Page
 *
 * Story 5.6b: Two tabs — Staff Performance and LGA Comparison.
 * Full filter suite, export capability, summary strip.
 */

import { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import type { CrossLgaFilterParams } from '@oslsr/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../../components/ui/select';
import { SkeletonTable } from '../../../components/skeletons';
import { useAllStaffProductivity, useLgaComparison, useCrossLgaExport } from '../hooks/useProductivity';
import { useToast } from '../../../hooks/useToast';
import CrossLgaStaffTable from '../components/CrossLgaStaffTable';
import LgaComparisonTable from '../components/LgaComparisonTable';
import LgaComparisonCard from '../components/LgaComparisonCard';
import LgaMultiSelect from '../components/LgaMultiSelect';
import { apiClient } from '../../../lib/api-client';

interface LgaOption {
  id: string;
  name: string;
}

interface SupervisorOption {
  id: string;
  name: string;
}

export default function SuperAdminProductivityPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('staff');

  // Shared filters
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lgaIds, setLgaIds] = useState<string[]>([]);

  // Staff tab filters
  const [roleFilter, setRoleFilter] = useState('all');
  const [supervisorFilter, setSupervisorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [staffPage, setStaffPage] = useState(1);
  const [staffPageSize, setStaffPageSize] = useState(50);
  const [staffSorting, setStaffSorting] = useState<SortingState>([]);

  // LGA tab filters
  const [staffingModel, setStaffingModel] = useState('all');
  const [lgaSorting, setLgaSorting] = useState<SortingState>([]);
  const [selectedLgaIds, setSelectedLgaIds] = useState<Set<string>>(new Set());

  // LGA list for multi-select (via TanStack Query — M1 fix)
  const lgaListQuery = useQuery({
    queryKey: ['admin', 'lgas'],
    queryFn: () => apiClient('/admin/lgas') as Promise<{ data: LgaOption[] }>,
    staleTime: 300_000, // 5 min — LGAs rarely change
  });
  const lgaList = lgaListQuery.data?.data ?? [];

  // Build filter params
  const staffFilters = useMemo<CrossLgaFilterParams>(() => ({
    period,
    ...(period === 'custom' && dateFrom ? { dateFrom } : {}),
    ...(period === 'custom' && dateTo ? { dateTo } : {}),
    lgaIds: lgaIds.length > 0 ? lgaIds : undefined,
    roleId: roleFilter !== 'all' ? roleFilter : undefined,
    supervisorId: supervisorFilter !== 'all' ? supervisorFilter : undefined,
    status: statusFilter,
    search: search || undefined,
    sortBy: staffSorting[0]?.id ?? 'fullName',
    sortOrder: staffSorting[0]?.desc ? 'desc' : 'asc',
    page: staffPage,
    pageSize: staffPageSize,
  }), [period, dateFrom, dateTo, lgaIds, roleFilter, supervisorFilter, statusFilter, search, staffSorting, staffPage, staffPageSize]);

  const lgaFilters = useMemo<CrossLgaFilterParams>(() => ({
    period,
    ...(period === 'custom' && dateFrom ? { dateFrom } : {}),
    ...(period === 'custom' && dateTo ? { dateTo } : {}),
    lgaIds: lgaIds.length > 0 ? lgaIds : undefined,
    staffingModel,
    sortBy: lgaSorting[0]?.id ?? 'lgaName',
    sortOrder: lgaSorting[0]?.desc ? 'desc' : 'asc',
  }), [period, dateFrom, dateTo, lgaIds, staffingModel, lgaSorting]);

  const staffQuery = useAllStaffProductivity(staffFilters);
  const lgaQuery = useLgaComparison(lgaFilters);
  const exportMutation = useCrossLgaExport();

  // Extract supervisor list from staff data for the supervisor filter dropdown
  const staffQueryData = staffQuery.data?.data;
  const supervisorOptions = useMemo<SupervisorOption[]>(() => {
    if (!staffQueryData) return [];
    const sups = new Map<string, string>();
    for (const row of staffQueryData) {
      if (row.role === 'supervisor') {
        sups.set(row.id, row.fullName);
      }
    }
    return Array.from(sups, ([id, name]) => ({ id, name }));
  }, [staffQueryData]);

  // Reset page on filter change
  useEffect(() => { setStaffPage(1); }, [period, lgaIds.length, roleFilter, supervisorFilter, statusFilter, search]);

  const handleExport = (format: 'csv' | 'pdf') => {
    const tab = activeTab as 'staff' | 'lga-comparison';
    const filters = tab === 'staff' ? staffFilters : lgaFilters;
    exportMutation.mutate(
      { tab, filters, format },
      {
        onError: () => {
          toast.error({ message: 'Export failed', description: 'Please try again.' });
        },
      },
    );
  };

  const handleRefresh = () => {
    if (activeTab === 'staff') {
      staffQuery.refetch();
    } else {
      lgaQuery.refetch();
    }
  };

  const lastUpdated = new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

  // Comparison card data
  const comparisonData = lgaQuery.data?.data?.filter((r) => selectedLgaIds.has(r.lgaId)) ?? [];

  return (
    <div className="p-6" data-testid="super-admin-productivity-page">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-brand font-semibold">Staff Productivity Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">Last updated: {lastUpdated}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="refresh-btn">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Summary strip */}
      {activeTab === 'staff' && staffQuery.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-testid="summary-strip">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Total Staff</p>
            <p className="text-2xl font-semibold mt-1">{staffQuery.data.meta.pagination.totalItems}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Submissions Today</p>
            <p className="text-2xl font-semibold mt-1">{staffQuery.data.summary.totalSubmissions}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Avg Per Staff</p>
            <p className="text-2xl font-semibold mt-1">{staffQuery.data.summary.avgPerDay}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Supervisorless LGAs</p>
            <p className="text-2xl font-semibold mt-1 text-amber-600">{staffQuery.data.summary.supervisorlessLgaCount}</p>
          </CardContent></Card>
        </div>
      )}
      {activeTab === 'lga-comparison' && lgaQuery.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-testid="summary-strip">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Total LGAs</p>
            <p className="text-2xl font-semibold mt-1">{lgaQuery.data.summary.totalLgas}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Total Submissions</p>
            <p className="text-2xl font-semibold mt-1">{lgaQuery.data.summary.totalSubmissions}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Overall Progress</p>
            <p className="text-2xl font-semibold mt-1">{lgaQuery.data.summary.overallPercent}%</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Supervisorless LGAs</p>
            <p className="text-2xl font-semibold mt-1 text-amber-600">{lgaQuery.data.summary.supervisorlessCount}</p>
          </CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="staff" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="staff" data-testid="tab-staff">Staff Performance</TabsTrigger>
            <TabsTrigger value="lga-comparison" data-testid="tab-lga-comparison">LGA Comparison</TabsTrigger>
          </TabsList>

          {/* Export buttons */}
          <div className="flex items-center gap-2" data-testid="export-controls">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={exportMutation.isPending}
              data-testid="export-csv"
            >
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={exportMutation.isPending}
              data-testid="export-pdf"
            >
              <Download className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        </div>

        {/* Shared filter row */}
        <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="filter-controls">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-32" data-testid="period-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {period === 'custom' && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
                data-testid="date-from"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
                data-testid="date-to"
              />
            </>
          )}

          <LgaMultiSelect lgas={lgaList} selectedIds={lgaIds} onChange={setLgaIds} />

          {activeTab === 'staff' && (
            <>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32" data-testid="role-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="enumerator">Enumerator</SelectItem>
                  <SelectItem value="data_entry_clerk">Clerk</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>

              <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
                <SelectTrigger className="w-40" data-testid="supervisor-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Supervisors</SelectItem>
                  {supervisorOptions.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="behind">Behind</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <input
                type="text"
                placeholder="Search by name or LGA..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded border border-neutral-200 px-3 py-1.5 text-sm w-48"
                data-testid="search-input"
              />
            </>
          )}

          {activeTab === 'lga-comparison' && (
            <Select value={staffingModel} onValueChange={setStaffingModel}>
              <SelectTrigger className="w-40" data-testid="staffing-model-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                <SelectItem value="full">Full Team</SelectItem>
                <SelectItem value="lean">Lean Team</SelectItem>
                <SelectItem value="no_supervisor">No Supervisor</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Staff Performance Tab */}
        <TabsContent value="staff">
          {staffQuery.isLoading ? (
            <SkeletonTable columns={15} rows={10} />
          ) : staffQuery.error ? (
            <div className="text-center py-8 text-red-500" data-testid="error-state">
              Failed to load staff productivity data. Please try again.
            </div>
          ) : (
            <CrossLgaStaffTable
              data={staffQuery.data?.data ?? []}
              summary={staffQuery.data?.summary ?? {
                totalSubmissions: 0, avgPerDay: 0, totalTarget: 0,
                overallPercent: 0, completedCount: 0, behindCount: 0, inactiveCount: 0,
                supervisorlessLgaCount: 0,
              }}
              sorting={staffSorting}
              onSortingChange={setStaffSorting}
              page={staffPage}
              pageSize={staffPageSize}
              totalItems={staffQuery.data?.meta?.pagination?.totalItems ?? 0}
              onPageChange={setStaffPage}
              onPageSizeChange={setStaffPageSize}
            />
          )}
        </TabsContent>

        {/* LGA Comparison Tab */}
        <TabsContent value="lga-comparison">
          {/* Comparison card */}
          {comparisonData.length >= 2 && (
            <LgaComparisonCard
              data={comparisonData}
              onClear={() => setSelectedLgaIds(new Set())}
            />
          )}

          {lgaQuery.isLoading ? (
            <SkeletonTable columns={12} rows={8} />
          ) : lgaQuery.error ? (
            <div className="text-center py-8 text-red-500" data-testid="error-state">
              Failed to load LGA comparison data. Please try again.
            </div>
          ) : (
            <LgaComparisonTable
              data={lgaQuery.data?.data ?? []}
              summary={lgaQuery.data?.summary ?? {
                totalLgas: 0, totalSubmissions: 0, overallPercent: 0, supervisorlessCount: 0,
              }}
              sorting={lgaSorting}
              onSortingChange={setLgaSorting}
              selectedLgaIds={selectedLgaIds}
              onSelectionChange={setSelectedLgaIds}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

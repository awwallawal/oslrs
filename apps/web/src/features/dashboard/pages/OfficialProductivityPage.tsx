/**
 * Government Official Productivity Page — Direction 08 Styling
 *
 * Story 5.6b AC4: Aggregate-only LGA productivity table.
 * No individual staff names. No export button. Read-only.
 */

import { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import type { LgaAggregateSummaryRow, ProductivityTrend } from '@oslsr/types';
import { Card, CardContent } from '../../../components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../../components/ui/select';
import { SkeletonTable } from '../../../components/skeletons';
import { SkeletonCard } from '../../../components/skeletons';
import { useLgaSummary } from '../hooks/useProductivity';

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

/** Table header that toggles sort */
function SortHeader({
  label,
  field,
  currentSortBy,
  currentSortOrder,
  onSort,
}: {
  label: string;
  field: string;
  currentSortBy: string;
  currentSortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const isActive = currentSortBy === field;
  return (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 whitespace-nowrap cursor-pointer select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && currentSortOrder === 'asc' && <ArrowUp className="h-3 w-3" />}
        {isActive && currentSortOrder === 'desc' && <ArrowDown className="h-3 w-3" />}
      </div>
    </th>
  );
}

export default function OfficialProductivityPage() {
  const [period, setPeriod] = useState<string>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [sortBy, setSortBy] = useState('lgaName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const params = useMemo(() => ({
    period,
    ...(period === 'custom' && dateFrom ? { dateFrom } : {}),
    ...(period === 'custom' && dateTo ? { dateTo } : {}),
    lgaId: lgaId || undefined,
    sortBy,
    sortOrder,
  }), [period, dateFrom, dateTo, lgaId, sortBy, sortOrder]);

  const { data, isLoading, error } = useLgaSummary(params);

  // Extract unique LGAs from data for filter dropdown
  const lgaOptions = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((r) => ({ id: r.lgaId, name: r.lgaName }));
  }, [data?.data]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="p-6" data-testid="official-productivity-page">
      {/* Direction 08: Dark header accent strip */}
      <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-2xl font-brand font-semibold">LGA Productivity Overview</h1>
        <p className="text-gray-300 mt-1">Aggregate field operation progress across LGAs</p>
      </div>

      {/* Summary strip */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : data?.summary && (
        <div className="grid gap-4 md:grid-cols-4 mb-6" data-testid="summary-strip">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Total LGAs</p>
            <p className="text-2xl font-semibold mt-1">{data.summary.totalLgas}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Active Staff</p>
            <p className="text-2xl font-semibold mt-1">{data.summary.totalActiveStaff}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Overall Completion</p>
            <p className="text-2xl font-semibold mt-1">{data.summary.overallCompletionRate}%</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase">Submissions Today</p>
            <p className="text-2xl font-semibold mt-1">{data.summary.totalSubmissionsToday}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Direction 08: Section header with maroon border */}
      <div className="border-l-4 border-[#9C1E23] pl-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Submission Activity</h2>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="filter-controls">
        <Select value={period} onValueChange={setPeriod}>
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

        <Select value={lgaId || '_all'} onValueChange={(v) => setLgaId(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-48" data-testid="lga-filter">
            <SelectValue placeholder="All LGAs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All LGAs</SelectItem>
            {lgaOptions.map((lga) => (
              <SelectItem key={lga.id} value={lga.id}>{lga.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <SkeletonTable columns={10} rows={8} />
      ) : error ? (
        <div className="text-center py-8 text-red-500" data-testid="error-state">
          Failed to load productivity data. Please try again.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200" data-testid="official-productivity-table">
          <table className="w-full text-sm" role="table">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <SortHeader label="LGA" field="lgaName" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Active Staff" field="activeStaff" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Today Total" field="todayTotal" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Daily Target" field="dailyTarget" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="%" field="percent" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="This Week" field="weekTotal" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Week Avg/Day" field="weekAvgPerDay" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="This Month" field="monthTotal" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Completion" field="completionRate" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Trend" field="trend" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {data?.data?.map((row: LgaAggregateSummaryRow) => (
                <tr
                  key={row.lgaId}
                  className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                  data-testid="lga-summary-row"
                >
                  <td className="px-3 py-2 font-medium">{row.lgaName}</td>
                  <td className="px-3 py-2 font-mono">{row.activeStaff}</td>
                  <td className="px-3 py-2 font-mono">{row.todayTotal}</td>
                  <td className="px-3 py-2 font-mono text-neutral-500">{row.dailyTarget}</td>
                  <td className="px-3 py-2"><ProgressBar percent={row.percent} /></td>
                  <td className="px-3 py-2 font-mono">{row.weekTotal}</td>
                  <td className="px-3 py-2 font-mono">{row.weekAvgPerDay}</td>
                  <td className="px-3 py-2 font-mono">{row.monthTotal}</td>
                  <td className="px-3 py-2"><ProgressBar percent={row.completionRate} /></td>
                  <td className="px-3 py-2"><TrendIndicator trend={row.trend} /></td>
                </tr>
              ))}
              {(!data?.data || data.data.length === 0) && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-neutral-400">
                    No productivity data available for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

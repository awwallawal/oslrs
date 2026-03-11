/**
 * TrendsCharts — Daily Registration Line Chart
 *
 * Story 8.2: Super-Admin / Government Official Survey Analytics Dashboard
 * Displays daily registration trends as an area chart with maroon gradient fill,
 * a cumulative registrations area chart, and a 7d/30d/90d date range toggle.
 */

import { useState, useId, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS } from './chart-utils';
import type { TrendDataPoint } from '@oslsr/types';

// NOTE: TrendDataPoint in analytics.ts only has { date, count }.
// There is no `sourceBreakdown` field on TrendStats — a stacked area chart
// for source channels would require extending the backend type first.

interface TrendsChartsProps {
  data: TrendDataPoint[];
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

type DateRange = '7d' | '30d' | '90d';

const DATE_RANGE_OPTIONS: { label: string; value: DateRange; days: number }[] = [
  { label: '7d', value: '7d', days: 7 },
  { label: '30d', value: '30d', days: 30 },
  { label: '90d', value: '90d', days: 90 },
];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Filter data points to the last N days from the most recent data point. */
function filterByDateRange(data: TrendDataPoint[], days: number): TrendDataPoint[] {
  if (data.length === 0) return data;
  const mostRecent = new Date(data[data.length - 1].date + 'T00:00:00Z');
  const cutoff = new Date(mostRecent);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return data.filter((d) => new Date(d.date + 'T00:00:00Z') >= cutoff);
}

/** Build cumulative data from daily registrations. */
function buildCumulative(data: TrendDataPoint[]): Array<TrendDataPoint & { cumulative: number; label: string }> {
  let running = 0;
  return data.map((d) => {
    running += d.count;
    return { ...d, cumulative: running, label: formatDateLabel(d.date) };
  });
}

export function TrendsCharts({ data, isLoading, error, onRetry, className }: TrendsChartsProps) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const gradientId = useId();
  const cumulativeGradientId = useId();

  // Sanitize IDs for SVG (useId returns colons which are valid in SVG but let's keep clean)
  const dailyGradient = `trendArea-${gradientId.replace(/:/g, '')}`;
  const cumulGradient = `cumulArea-${cumulativeGradientId.replace(/:/g, '')}`;

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const days = DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.days ?? 30;
    return filterByDateRange(data, days);
  }, [data, dateRange]);

  const dailyChartData = useMemo(
    () => filteredData.map((d) => ({ ...d, label: formatDateLabel(d.date) })),
    [filteredData],
  );

  const cumulativeChartData = useMemo(
    () => buildCumulative(filteredData),
    [filteredData],
  );

  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <div data-testid="trends-charts" className={className}>
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-red-500 mb-3">Unable to load data</p>
              {onRetry && (
                <button onClick={onRetry} className="text-sm text-blue-600 hover:underline">
                  Try again
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card data-testid="trends-charts" className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registration Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-neutral-400 py-8" data-testid="trends-empty">
            No trend data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="trends-charts" className={`space-y-6 ${className ?? ''}`}>
      {/* Daily Registrations */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="border-l-4 border-[#9C1E23] pl-3">
              <CardTitle className="text-base">Daily Registrations</CardTitle>
            </div>
            {/* Date range toggle */}
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden" role="group" aria-label="Date range">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  className={`px-3 py-1 text-sm transition-colors ${
                    dateRange === opt.value
                      ? 'bg-[#9C1E23] text-white'
                      : 'bg-white text-neutral-600 hover:bg-neutral-100'
                  }`}
                  data-testid={`range-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChartData}>
                <defs>
                  <linearGradient id={dailyGradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as TrendDataPoint & { label: string };
                    return (
                      <div className="bg-white p-2 rounded shadow border text-sm">
                        <p className="font-medium">{item.date}</p>
                        <p>
                          Registrations: <strong>{item.count.toLocaleString()}</strong>
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  fill={`url(#${dailyGradient})`}
                  dot={false}
                  activeDot={{ r: 4, fill: CHART_COLORS[0] }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Cumulative Registrations */}
      <Card>
        <CardHeader className="pb-2">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Cumulative Registrations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeChartData}>
                <defs>
                  <linearGradient id={cumulGradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[7]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[7]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as TrendDataPoint & { cumulative: number; label: string };
                    return (
                      <div className="bg-white p-2 rounded shadow border text-sm">
                        <p className="font-medium">{item.date}</p>
                        <p>
                          Daily: <strong>{item.count.toLocaleString()}</strong>
                        </p>
                        <p>
                          Cumulative: <strong>{item.cumulative.toLocaleString()}</strong>
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={CHART_COLORS[7]}
                  strokeWidth={2}
                  fill={`url(#${cumulGradient})`}
                  dot={false}
                  activeDot={{ r: 4, fill: CHART_COLORS[7] }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

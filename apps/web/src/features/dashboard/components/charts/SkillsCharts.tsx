/**
 * SkillsCharts — Top Skills Horizontal Bar Chart + Donut View
 *
 * Story 8.2: Super-Admin / Government Official Survey Analytics Dashboard
 * Displays skills frequency as a horizontal bar chart with expand/collapse toggle,
 * plus an optional donut (pie) view for top skills by count.
 */

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS } from './chart-utils';
import type { SkillsFrequency } from '@oslsr/types';

interface SkillsChartsProps {
  data: SkillsFrequency[];
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

type ViewMode = 'bar' | 'donut';

const DEFAULT_VISIBLE = 20;
const DONUT_MAX = 10;

export function SkillsCharts({ data, isLoading, error, onRetry, className }: SkillsChartsProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('bar');

  const donutData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const top = data.slice(0, DONUT_MAX);
    const otherCount = data.slice(DONUT_MAX).reduce((sum, d) => sum + d.count, 0);
    const otherPct = data.slice(DONUT_MAX).reduce((sum, d) => sum + d.percentage, 0);
    if (otherCount > 0) {
      return [...top, { skill: 'Other', count: otherCount, percentage: otherPct }];
    }
    return top;
  }, [data]);

  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <div data-testid="skills-charts" className={className}>
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
      <Card data-testid="skills-charts" className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-neutral-400 py-8" data-testid="skills-empty">
            No skills data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayData = expanded ? data : data.slice(0, DEFAULT_VISIBLE);
  const canToggle = data.length > DEFAULT_VISIBLE;
  const chartHeight = Math.max(400, displayData.length * 28);

  return (
    <Card data-testid="skills-charts" className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Top Skills</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden" role="group" aria-label="View mode">
              <button
                onClick={() => setViewMode('bar')}
                className={`px-3 py-1 text-sm transition-colors ${
                  viewMode === 'bar'
                    ? 'bg-[#9C1E23] text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-100'
                }`}
                data-testid="skills-view-bar"
              >
                Bar
              </button>
              <button
                onClick={() => setViewMode('donut')}
                className={`px-3 py-1 text-sm transition-colors ${
                  viewMode === 'donut'
                    ? 'bg-[#9C1E23] text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-100'
                }`}
                data-testid="skills-view-donut"
              >
                Donut
              </button>
            </div>
            {/* Expand/collapse (bar mode only) */}
            {viewMode === 'bar' && canToggle && (
              <button
                onClick={() => setExpanded((prev) => !prev)}
                className="px-3 py-1 text-sm rounded-full transition-colors bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                data-testid="skills-toggle"
              >
                {expanded ? 'Show Less' : 'Show More'}
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'bar' ? (
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="skill"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={150}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as SkillsFrequency;
                    return (
                      <div className="bg-white p-2 rounded shadow border text-sm">
                        <p className="font-medium">{item.skill}</p>
                        <p>
                          Count: <strong>{item.count.toLocaleString()}</strong>
                        </p>
                        <p>
                          Percentage: <strong>{item.percentage.toFixed(1)}%</strong>
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={CHART_COLORS[0]}
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Donut view */
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="count"
                  nameKey="skill"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {donutData.map((entry, index) => (
                    <Cell
                      key={entry.skill}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as SkillsFrequency;
                    return (
                      <div className="bg-white p-2 rounded shadow border text-sm">
                        <p className="font-medium">{item.skill}</p>
                        <p>
                          Count: <strong>{item.count.toLocaleString()}</strong>
                        </p>
                        <p>
                          Percentage: <strong>{item.percentage.toFixed(1)}%</strong>
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value: string) => <span className="text-sm">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

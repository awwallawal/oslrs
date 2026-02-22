/**
 * LGA Breakdown Chart — Horizontal Bar Chart
 *
 * Story 5.1 AC3: Sorted horizontal bar chart of all 33 Oyo State LGAs
 * colored by registration density (light-to-dark maroon gradient).
 * Direction 08 styling.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import type { LgaBreakdown } from '../api/official.api';

interface LgaBreakdownChartProps {
  data: LgaBreakdown[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

/**
 * Interpolate between lighter maroon and darker maroon based on intensity (0-1).
 */
function getMaroonGradient(intensity: number): string {
  // Lighter: #E8A1A3 (232, 161, 163) → Darker: #9C1E23 (156, 30, 35)
  const r = Math.round(232 + (156 - 232) * intensity);
  const g = Math.round(161 + (30 - 161) * intensity);
  const b = Math.round(163 + (35 - 163) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

export function LgaBreakdownChart({ data, isLoading, error, className }: LgaBreakdownChartProps) {
  if (isLoading) return <SkeletonCard className={className} />;
  if (error) {
    return (
      <Card data-testid="lga-breakdown-chart" className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">LGA Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 py-8" data-testid="lga-error">
            Unable to load LGA data. Please try again later.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card data-testid="lga-breakdown-chart" className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">LGA Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-neutral-400 py-8" data-testid="lga-empty">
            No LGA data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = Math.max(400, data.length * 24);

  return (
    <Card data-testid="lga-breakdown-chart" className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">LGA Distribution</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" barGap={2}>
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="lgaName"
                tick={{ fontSize: 11 }}
                width={140}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const item = payload[0].payload as LgaBreakdown;
                  return (
                    <div className="bg-white p-2 rounded shadow border text-sm">
                      <p className="font-medium">{item.lgaName}</p>
                      <p>Respondents: <strong>{item.count.toLocaleString()}</strong></p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Respondents">
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={getMaroonGradient(entry.count / maxCount)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

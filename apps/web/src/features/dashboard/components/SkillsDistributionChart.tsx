/**
 * Skills Distribution Chart — Donut/Pie Chart
 *
 * Story 5.1 AC2: Skills/occupation distribution chart showing
 * respondent counts grouped by primary skill/occupation.
 * Direction 08 styling with maroon primary color.
 */

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import type { SkillDistribution } from '../api/official.api';

interface SkillsDistributionChartProps {
  data: SkillDistribution[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

// Sequential maroon palette for pie segments
const MAROON_PALETTE = [
  '#9C1E23', // Primary maroon
  '#B4383D',
  '#CC5257',
  '#D97B7E',
  '#E8A1A3',
  '#7A171B', // Darker maroon
  '#5C1114',
  '#F0C0C2',
  '#A63B3F',
  '#C96468',
];

export function SkillsDistributionChart({ data, isLoading, error, className }: SkillsDistributionChartProps) {
  if (isLoading) return <SkeletonCard className={className} />;
  if (error) {
    return (
      <Card data-testid="skills-distribution-chart" className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Skills Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 py-8" data-testid="skills-error">
            Unable to load skills data. Please try again later.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card data-testid="skills-distribution-chart" className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Skills Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-neutral-400 py-8" data-testid="skills-empty">
            No skill data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card data-testid="skills-distribution-chart" className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Skills Distribution</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="skill"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {data.map((_entry, index) => (
                  <Cell
                    key={index}
                    fill={MAROON_PALETTE[index % MAROON_PALETTE.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const item = payload[0].payload as SkillDistribution;
                  const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                  return (
                    <div className="bg-white p-2 rounded shadow border text-sm">
                      <p className="font-medium">{item.skill}</p>
                      <p>Count: <strong>{item.count.toLocaleString()}</strong></p>
                      <p>Share: <strong>{pct}%</strong></p>
                    </div>
                  );
                }}
              />
              <Legend
                formatter={(value: string, entry: any) => {
                  const item = data.find((d) => d.skill === value);
                  const pct = item && total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                  return <span className="text-sm">{value} ({pct}%)</span>;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Personal Skills Chart — horizontal bar showing top 10 skills
 * Story 8.3: Enumerator/Clerk personal stats
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS, formatLabel } from './chart-utils';
import type { SkillsFrequency } from '@oslsr/types';

interface Props {
  data?: SkillsFrequency[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function PersonalSkillsChart({ data, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error || !data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">
          {error ? 'Failed to load skills data' : 'No skills data yet'}
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((s) => ({
    name: formatLabel(s.skill).slice(0, 20),
    count: s.count,
  }));

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Top Skills Collected</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill={CHART_COLORS[0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

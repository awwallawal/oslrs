/**
 * Team Completion Time Chart — grouped bar per enumerator
 * Story 8.3: Supervisor team analytics
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS } from './chart-utils';
import type { EnumeratorQualityMetric } from '@oslsr/types';

interface Props {
  enumerators?: EnumeratorQualityMetric[];
  teamAvgTime: number | null;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function TeamCompletionTimeChart({ enumerators, teamAvgTime, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error || !enumerators || enumerators.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">
          {error ? 'Failed to load data' : 'No completion time data'}
        </CardContent>
      </Card>
    );
  }

  const chartData = enumerators
    .filter((e) => e.avgCompletionTimeSec !== null)
    .map((e) => ({
      name: e.name.split(' ')[0],
      minutes: +(e.avgCompletionTimeSec! / 60).toFixed(1),
    }))
    .sort((a, b) => a.minutes - b.minutes);

  const avgMinutes = teamAvgTime !== null ? +(teamAvgTime / 60).toFixed(1) : null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Avg Completion Time per Enumerator</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${v}m`} />
            <Tooltip formatter={(value) => `${value} min`} />
            <Bar dataKey="minutes" name="Avg Time" fill={CHART_COLORS[0]} />
            {avgMinutes !== null && (
              <ReferenceLine y={avgMinutes} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `Team Avg: ${avgMinutes}m`, position: 'top' }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

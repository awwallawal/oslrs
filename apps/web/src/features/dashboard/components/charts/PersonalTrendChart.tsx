/**
 * Personal Trend Chart — daily submission line chart with cumulative
 * Story 8.3: Enumerator/Clerk personal stats
 */

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS } from './chart-utils';
import type { TrendDataPoint } from '@oslsr/types';

interface Props {
  data?: TrendDataPoint[];
  label?: string;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function PersonalTrendChart({ data, label = 'Submissions', isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error || !data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">
          {error ? 'Failed to load trend data' : 'No trend data yet'}
        </CardContent>
      </Card>
    );
  }

  // Add cumulative line
  let cumulative = 0;
  const chartData = data.map((d) => {
    cumulative += d.count;
    return {
      date: d.date.slice(5), // MM-DD
      count: d.count,
      cumulative,
    };
  });

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Daily {label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="daily" orientation="left" />
            <YAxis yAxisId="cumulative" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="daily" type="monotone" dataKey="count" name={`Daily ${label}`} stroke={CHART_COLORS[0]} dot={false} />
            <Line yAxisId="cumulative" type="monotone" dataKey="cumulative" name="Cumulative" stroke={CHART_COLORS[7]} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

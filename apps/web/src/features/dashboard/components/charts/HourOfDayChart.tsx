/**
 * Hour-of-Day Pattern Chart
 * Story 8.3: Supervisor team analytics — avg submissions by hour (WAT)
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS } from './chart-utils';
import type { FrequencyBucket } from '@oslsr/types';

interface Props {
  data?: FrequencyBucket[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function HourOfDayChart({ data, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error || !data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">
          {error ? 'Failed to load data' : 'No hourly data'}
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: d.label,
    count: d.count ?? 0,
  }));

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Submissions by Hour (WAT)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" interval={2} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill={CHART_COLORS[2]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

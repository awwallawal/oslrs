/**
 * Review Throughput Chart — stacked area chart showing daily approved + rejected reviews
 * Story 8.4 AC#1, AC#3
 */

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';
import type { ReviewThroughput } from '@oslsr/types';

interface Props {
  data?: ReviewThroughput[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function ReviewThroughputChart({ data, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load review throughput</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No review data available</CardContent>
      </Card>
    );
  }

  const avgDaily = Math.round(data.reduce((s, d) => s + d.reviewedCount, 0) / data.length);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Review Throughput</CardTitle>
          </div>
          <ChartExportButton data={data} filename="review-throughput" />
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip />
            <ReferenceLine y={avgDaily} stroke="#9C1E23" strokeDasharray="4 4" label={{ value: `Avg: ${avgDaily}`, fill: '#9C1E23', fontSize: 11 }} />
            <Area type="monotone" dataKey="approvedCount" name="Approved" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
            <Area type="monotone" dataKey="rejectedCount" name="Rejected" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

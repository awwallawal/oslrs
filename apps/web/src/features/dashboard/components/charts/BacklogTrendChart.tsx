/**
 * Backlog Trend Chart — line chart showing pending queue size over time
 * Story 8.4 AC#1
 */

import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';
import type { BacklogTrend } from '@oslsr/types';

interface Props {
  data?: BacklogTrend[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function BacklogTrendChart({ data, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load backlog trend</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No backlog data available</CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Backlog Trend</CardTitle>
          </div>
          <ChartExportButton data={data as Record<string, unknown>[]} filename="backlog-trend" />
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="pendingCount" name="Total Pending" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
            <Line type="monotone" dataKey="highCriticalCount" name="High/Critical" stroke="#ef4444" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

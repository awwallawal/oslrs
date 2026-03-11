/**
 * Verification Funnel Chart — horizontal waterfall: Submissions -> Flagged -> Reviewed -> Approved/Rejected
 * Story 8.4 AC#1
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';
import type { VerificationFunnel } from '@oslsr/types';

interface Props {
  data?: VerificationFunnel;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

const FUNNEL_COLORS = ['#3b82f6', '#f59e0b', '#6366f1', '#22c55e', '#ef4444'];

export default function VerificationFunnelChart({ data, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load verification funnel</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const chartData = [
    { name: 'Submissions', value: data.totalSubmissions },
    { name: 'Flagged', value: data.totalFlagged },
    { name: 'Reviewed', value: data.totalReviewed },
    { name: 'Approved', value: data.totalApproved },
    { name: 'Rejected', value: data.totalRejected },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Verification Funnel</CardTitle>
          </div>
          <ChartExportButton data={chartData} filename="verification-funnel" />
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={90} />
            <Tooltip formatter={(value: number | undefined) => (value ?? 0).toLocaleString()} />
            <Bar dataKey="value">
              {chartData.map((_, index) => (
                <Cell key={index} fill={FUNNEL_COLORS[index]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

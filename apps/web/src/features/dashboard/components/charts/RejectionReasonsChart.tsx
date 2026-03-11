/**
 * Rejection Reasons Chart — horizontal bar chart of supervisor resolution reasons
 * Story 8.4 AC#1
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';
import { CHART_COLORS, formatLabel } from './chart-utils';
import type { RejectionReasonFrequency } from '@oslsr/types';

interface Props {
  data?: RejectionReasonFrequency[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function RejectionReasonsChart({ data, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load rejection reasons</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No rejection data available</CardContent>
      </Card>
    );
  }

  const chartData = data.map(r => ({
    ...r,
    displayReason: formatLabel(r.reason),
  }));

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Resolution Reasons</CardTitle>
          </div>
          <ChartExportButton data={chartData as Record<string, unknown>[]} filename="rejection-reasons" />
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="displayReason" width={140} />
            <Tooltip formatter={(value: number | undefined, name: string | undefined) => name === 'count' ? (value ?? 0) : `${value ?? 0}%`} />
            <Bar dataKey="count">
              {chartData.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

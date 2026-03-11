/**
 * Fraud Type Breakdown Chart — horizontal bar chart with 5 heuristic types
 * Story 8.4 AC#1, AC#2 — bars are clickable, navigating to audit queue filtered by heuristic
 */

import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';
import { CHART_COLORS } from './chart-utils';
import type { FraudTypeBreakdown } from '@oslsr/types';

interface Props {
  data?: FraudTypeBreakdown;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

const HEURISTIC_MAP: { key: keyof FraudTypeBreakdown; label: string; heuristic: string }[] = [
  { key: 'gpsCluster', label: 'GPS Cluster', heuristic: 'gps_clustering' },
  { key: 'speedRun', label: 'Speed Run', heuristic: 'speed_run' },
  { key: 'straightLining', label: 'Straight-lining', heuristic: 'straight_lining' },
  { key: 'duplicateResponse', label: 'Duplicate', heuristic: 'duplicate_response' },
  { key: 'offHours', label: 'Off Hours', heuristic: 'off_hours' },
];

export default function FraudTypeBreakdownChart({ data, isLoading, error, className }: Props) {
  const navigate = useNavigate();

  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load fraud breakdown</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const chartData = HEURISTIC_MAP.map(h => ({
    name: h.label,
    count: data[h.key],
    heuristic: h.heuristic,
  }));

  const handleBarClick = (_: unknown, index: number) => {
    const heuristic = chartData[index]?.heuristic;
    if (heuristic) {
      navigate(`/dashboard/assessor/queue?heuristic=${heuristic}`);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Fraud Type Breakdown</CardTitle>
            <p className="text-xs text-neutral-500 mt-1">Click a bar to filter the audit queue</p>
          </div>
          <ChartExportButton data={chartData} filename="fraud-type-breakdown" />
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={110} />
            <Tooltip />
            <Bar dataKey="count" cursor="pointer" onClick={handleBarClick}>
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

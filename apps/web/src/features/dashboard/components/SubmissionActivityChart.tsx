import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { computeSummary } from '../hooks/useDashboardStats';
import type { DailyCount } from '../../forms/api/submission.api';

interface SubmissionActivityChartProps {
  data: DailyCount[];
  target: number;
  days: number;
  onDaysChange: (days: number) => void;
  isLoading: boolean;
  error: Error | null;
  roleLabel: string;
  className?: string;
}

function formatDateLabel(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (days <= 7) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SubmissionActivityChart({
  data,
  target,
  days,
  onDaysChange,
  isLoading,
  error,
  roleLabel,
  className,
}: SubmissionActivityChartProps) {
  if (isLoading) return <SkeletonCard className={className} />;
  if (error) return null;

  const summary = computeSummary(data);
  const chartData = data.map((d) => ({
    ...d,
    target,
    label: formatDateLabel(d.date, days),
  }));

  return (
    <Card data-testid="submission-activity-chart" className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">{roleLabel} Activity</CardTitle>
          <div className="flex gap-1" data-testid="days-toggle">
            <button
              onClick={() => onDaysChange(7)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                days === 7
                  ? 'bg-[#9C1E23] text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
              data-testid="toggle-7d"
            >
              7 Days
            </button>
            <button
              onClick={() => onDaysChange(30)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                days === 30
                  ? 'bg-[#9C1E23] text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
              data-testid="toggle-30d"
            >
              30 Days
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary strip */}
        <div className="flex gap-4 text-sm text-neutral-600 mb-4" data-testid="summary-strip">
          <span>Avg <strong>{summary.avg}</strong>/day</span>
          <span>Best <strong>{summary.best}</strong></span>
          <span>Total <strong>{summary.total}</strong></span>
        </div>

        {/* Defensive: parents call fillDateGaps() so data is normally non-empty,
            but guard against direct usage without gap-filling */}
        {data.length === 0 ? (
          <div className="text-center text-neutral-400 py-8" data-testid="chart-empty">
            No submission data for this period
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white p-2 rounded shadow border text-sm">
                        <p className="font-medium">{item.date}</p>
                        <p>Actual: <strong>{item.count}</strong></p>
                        <p>Target: <strong>{item.target}</strong></p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={target}
                  stroke="#9ca3af"
                  strokeDasharray="4 4"
                  label={{ value: `Target: ${target}`, position: 'right', fontSize: 11, fill: '#9ca3af' }}
                />
                <Bar dataKey="target" fill="#e5e7eb" radius={[2, 2, 0, 0]} name="Target" />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} name="Actual">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.count >= target ? '#10b981' : '#9C1E23'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

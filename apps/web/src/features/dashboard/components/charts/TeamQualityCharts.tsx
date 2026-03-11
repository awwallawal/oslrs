/**
 * Team Quality Charts — Per-enumerator comparison bars
 * Story 8.3: Supervisor team analytics
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS } from './chart-utils';
import type { TeamQualityData } from '@oslsr/types';

interface Props {
  data?: TeamQualityData;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

function formatRate(val: number | null): string {
  if (val === null) return '—';
  return `${(val * 100).toFixed(0)}%`;
}

export default function TeamQualityCharts({ data, isLoading, error, onRetry, className }: Props) {
  if (isLoading) {
    return <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${className ?? ''}`}><SkeletonCard /><SkeletonCard /></div>;
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load team quality data</p>
          {onRetry && <button onClick={onRetry} className="mt-2 text-sm text-[#9C1E23] underline">Retry</button>}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.enumerators.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No team data available</CardContent>
      </Card>
    );
  }

  const sorted = [...data.enumerators].sort((a, b) => b.submissionCount - a.submissionCount);
  const chartData = sorted.map((e) => ({
    name: e.name.split(' ')[0],
    submissions: e.submissionCount,
    gpsRate: e.gpsRate !== null ? +(e.gpsRate * 100).toFixed(1) : null,
    ninRate: e.ninRate !== null ? +(e.ninRate * 100).toFixed(1) : null,
    fraudRate: e.fraudFlagRate !== null ? +(e.fraudFlagRate * 100).toFixed(1) : null,
  }));

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${className ?? ''}`}>
      <Card>
        <CardHeader className="pb-2">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Submissions by Enumerator</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip />
              <Bar dataKey="submissions" fill={CHART_COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Quality Rates by Enumerator</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
              <Bar dataKey="gpsRate" name="GPS %" fill={CHART_COLORS[0]} />
              <Bar dataKey="ninRate" name="NIN %" fill={CHART_COLORS[2]} />
              <Bar dataKey="fraudRate" name="Fraud %" fill={CHART_COLORS[7]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary stat cards */}
      <Card className="md:col-span-2">
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-sm text-neutral-500">Team Submissions</div>
              <div className="text-2xl font-bold text-[#9C1E23]">
                {data.enumerators.reduce((s, e) => s + e.submissionCount, 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">Avg Completion</div>
              <div className="text-2xl font-bold">
                {data.teamAverages.avgCompletionTime !== null
                  ? `${Math.round(data.teamAverages.avgCompletionTime / 60)}m`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">GPS Coverage</div>
              <div className="text-2xl font-bold">{formatRate(data.teamAverages.gpsRate)}</div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">NIN Capture</div>
              <div className="text-2xl font-bold">{formatRate(data.teamAverages.ninRate)}</div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">Fraud Rate</div>
              <div className="text-2xl font-bold">{formatRate(data.teamAverages.fraudRate)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

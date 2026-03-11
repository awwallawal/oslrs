/**
 * Data Quality Scorecard — gamified composite score display (0-100)
 * Story 8.3: Enumerator/Clerk personal stats
 */

import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import type { PersonalStatsData } from '@oslsr/types';

interface Props {
  data?: PersonalStatsData;
  isClerk?: boolean;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

function scoreColor(score: number | null, teamAvg: number | null): string {
  if (score === null) return 'text-neutral-400';
  if (teamAvg === null) return 'text-neutral-700';
  if (score >= teamAvg) return 'text-green-600';
  if (score >= teamAvg * 0.9) return 'text-amber-500';
  return 'text-red-500';
}

function badgeColor(rate: number | null, teamRate: number | null, invert = false): string {
  if (rate === null || teamRate === null) return 'bg-neutral-100 text-neutral-500';
  const better = invert ? rate <= teamRate : rate >= teamRate;
  const near = invert
    ? rate <= teamRate * 1.1
    : rate >= teamRate * 0.9;
  if (better) return 'bg-green-100 text-green-700';
  if (near) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function formatRate(val: number | null): string {
  if (val === null) return '—';
  return `${(val * 100).toFixed(0)}%`;
}

export default function DataQualityScorecard({ data, isClerk, isLoading, error, className }: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-red-600">Failed to load quality data</CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No quality data available</CardContent>
      </Card>
    );
  }

  const score = data.compositeQualityScore;

  const gaugeColor = score === null ? '#D1D5DB'
    : score >= 80 ? '#22c55e'
    : score >= 60 ? '#f59e0b'
    : '#ef4444';

  const metrics = [
    ...(!isClerk ? [{ label: 'GPS Capture', value: data.gpsRate, teamAvg: null as number | null, invert: false }] : []),
    { label: 'NIN Capture', value: data.ninRate, teamAvg: null as number | null, invert: false },
    { label: 'Skip Rate', value: data.skipRate, teamAvg: null as number | null, invert: true },
    { label: 'Fraud Rate', value: data.fraudFlagRate, teamAvg: data.teamAvgFraudRate, invert: true },
  ];

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      {/* Composite Score Gauge */}
      <Card>
        <CardHeader className="pb-2">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Data Quality Score</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#E5E7EB" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={gaugeColor} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(score ?? 0) * 2.64} 264`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold" style={{ color: gaugeColor }}>
                {score !== null ? Math.round(score) : '—'}
              </span>
            </div>
          </div>
          <p className="text-sm text-neutral-500 mt-2">out of 100</p>
        </CardContent>
      </Card>

      {/* Individual Metric Cards */}
      <div className={`grid ${isClerk ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'} gap-4`}>
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="py-4 text-center">
              <div className="text-sm text-neutral-500">{m.label}</div>
              <div className={`text-2xl font-bold mt-1 ${m.teamAvg !== null ? (m.invert
                ? (m.value !== null && m.value <= (m.teamAvg ?? 0) ? 'text-green-600' : 'text-red-500')
                : (m.value !== null && m.value >= (m.teamAvg ?? 0) ? 'text-green-600' : 'text-red-500'))
                : 'text-neutral-800'}`}>
                {formatRate(m.value)}
              </div>
              {m.teamAvg !== null && (
                <div className="text-xs text-neutral-400 mt-1">
                  Team: {formatRate(m.teamAvg)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

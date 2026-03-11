/**
 * Pipeline Stat Cards — 4 stat cards for verification pipeline metrics
 * Story 8.4 AC#1
 */

import { Card, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';

interface Props {
  avgReviewTimeMinutes: number | null;
  medianTimeToResolutionDays: number | null;
  completenessRate: number;
  consistencyRate: number;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function PipelineStatCards({
  avgReviewTimeMinutes,
  medianTimeToResolutionDays,
  completenessRate,
  consistencyRate,
  isLoading,
  error,
  className,
}: Props) {
  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className ?? ''}`}>
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load pipeline metrics</p>
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      label: 'Avg Review Time',
      value: avgReviewTimeMinutes !== null ? `${Math.round(avgReviewTimeMinutes)}m` : '—',
      color: 'text-[#9C1E23]',
    },
    {
      label: 'Time to Resolution',
      value: medianTimeToResolutionDays !== null ? `${medianTimeToResolutionDays.toFixed(1)}d` : '—',
      color: 'text-[#9C1E23]',
    },
    {
      label: 'Data Completeness',
      value: `${completenessRate.toFixed(1)}%`,
      color: completenessRate >= 90 ? 'text-green-600' : completenessRate >= 70 ? 'text-amber-600' : 'text-red-600',
    },
    {
      label: 'Data Consistency',
      value: `${consistencyRate.toFixed(1)}%`,
      color: consistencyRate >= 80 ? 'text-green-600' : consistencyRate >= 60 ? 'text-amber-600' : 'text-red-600',
    },
  ];

  const exportData = cards.map(c => ({ metric: c.label, value: c.value }));

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className ?? ''}`} data-testid="pipeline-stat-cards">
      <div className="col-span-full flex justify-end -mb-2">
        <ChartExportButton data={exportData} filename="pipeline-metrics" />
      </div>
      {cards.map(card => (
        <Card key={card.label}>
          <CardContent className="py-4 text-center">
            <div className="text-sm text-neutral-500">{card.label}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

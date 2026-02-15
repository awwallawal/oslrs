import { TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';

interface TodayProgressCardProps {
  todayCount: number;
  target: number;
  label: string;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export function TodayProgressCard({ todayCount, target, label, isLoading, error, className }: TodayProgressCardProps) {
  if (isLoading) return <SkeletonCard className={className} />;
  if (error) return null;

  const pct = Math.min(100, Math.round((todayCount / (target || 1)) * 100));
  const metTarget = todayCount >= target;

  return (
    <Card data-testid="today-progress-card" className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <CardTitle className="text-base">Today's Progress</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold text-neutral-900">
          <span data-testid="today-count">{todayCount}</span>
          <span className="text-neutral-500 font-normal"> / {target} {label}</span>
        </p>
        <div className="mt-2 w-full bg-neutral-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${metTarget ? 'bg-emerald-500' : 'bg-[#9C1E23]'}`}
            style={{ width: `${pct}%` }}
            data-testid="progress-bar"
          />
        </div>
      </CardContent>
    </Card>
  );
}

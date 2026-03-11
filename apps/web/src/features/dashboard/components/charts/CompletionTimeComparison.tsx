/**
 * Completion Time Comparison — personal vs team average
 * Story 8.3: Enumerator/Clerk personal stats
 */

import { Card, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

interface Props {
  avgTimeSec: number | null;
  teamAvgTimeSec: number | null;
  label?: string;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default function CompletionTimeComparison({
  avgTimeSec, teamAvgTimeSec, label = 'Avg Completion Time', isLoading, error, className,
}: Props) {
  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-4 text-center text-red-600 text-sm">Failed to load</CardContent>
      </Card>
    );
  }

  const delta = avgTimeSec !== null && teamAvgTimeSec !== null
    ? avgTimeSec - teamAvgTimeSec
    : null;

  const isFaster = delta !== null && delta < 0;
  const isSlower = delta !== null && delta > 0;

  return (
    <Card className={className}>
      <CardContent className="py-4">
        <div className="text-sm text-neutral-500 mb-1">{label}</div>
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-xs text-neutral-400">You</div>
            <div className="text-2xl font-bold text-[#9C1E23]">{formatTime(avgTimeSec)}</div>
          </div>
          <div className="text-neutral-300">vs</div>
          <div>
            <div className="text-xs text-neutral-400">Team</div>
            <div className="text-2xl font-bold text-neutral-600">{formatTime(teamAvgTimeSec)}</div>
          </div>
        </div>
        {delta !== null && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${isFaster ? 'text-green-600' : isSlower ? 'text-red-500' : 'text-neutral-500'}`}>
            {isFaster ? <ArrowDown className="w-4 h-4" /> : isSlower ? <ArrowUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            <span>{isFaster ? 'Faster' : isSlower ? 'Slower' : 'Same'} than team avg</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Card } from '../../../components/ui/card';

interface ThresholdGuardProps {
  threshold: { met: boolean; currentN: number; requiredN: number };
  label: string;
  children: React.ReactNode;
}

export function ThresholdGuard({ threshold, label, children }: ThresholdGuardProps) {
  if (!threshold.met) {
    const remaining = threshold.requiredN - threshold.currentN;
    const pct = Math.min(100, Math.round((threshold.currentN / threshold.requiredN) * 100));
    return (
      <Card className="p-6 text-center" data-testid="threshold-guard">
        <p className="text-muted-foreground">
          {label} requires at least {threshold.requiredN} submissions.
        </p>
        <p className="text-sm mt-1">
          {remaining} more needed.
        </p>
        <div className="mt-3 max-w-xs mx-auto h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#9C1E23] rounded-full transition-all"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={threshold.currentN}
            aria-valuemin={0}
            aria-valuemax={threshold.requiredN}
          />
        </div>
      </Card>
    );
  }
  return <>{children}</>;
}

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { AnimatedCounter } from './AnimatedCounter';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  subtitle?: string;
}

export function StatCard({ icon: Icon, label, value, prefix, suffix, subtitle }: StatCardProps) {
  return (
    <Card className="bg-white/10 border-white/20 text-white">
      <CardContent className="p-4 flex flex-col items-center text-center gap-2">
        <Icon className="h-6 w-6 text-white/80" />
        <div className="text-2xl font-bold">
          {value != null ? (
            <AnimatedCounter value={value} prefix={prefix} suffix={suffix} />
          ) : (
            <span aria-label="Not available">N/A</span>
          )}
        </div>
        <div className="text-sm text-white/80">{label}</div>
        {subtitle && <div className="text-xs text-white/60">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

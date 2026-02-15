import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';

interface TotalSubmissionsCardProps {
  total: number;
  label: string;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export function TotalSubmissionsCard({ total, label, isLoading, error, className }: TotalSubmissionsCardProps) {
  if (isLoading) return <SkeletonCard className={className} />;
  if (error) return null;

  return (
    <Card data-testid="total-submissions-card" className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
          </div>
          <CardTitle className="text-base">{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-neutral-900">{total}</p>
        <p className="text-sm text-neutral-500 mt-1">all time</p>
      </CardContent>
    </Card>
  );
}

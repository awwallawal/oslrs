import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';

interface SurveyCompletionCardProps {
  total: number;
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export function SurveyCompletionCard({ total, isLoading, error, className }: SurveyCompletionCardProps) {
  if (isLoading) return <SkeletonCard className={className} />;
  if (error) return null;

  const completed = total > 0;

  return (
    <Card data-testid="survey-completion-card" className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${completed ? 'bg-green-100' : 'bg-neutral-100'}`}>
            {completed
              ? <CheckCircle2 className="w-5 h-5 text-green-600" />
              : <Circle className="w-5 h-5 text-neutral-400" />
            }
          </div>
          <CardTitle className="text-base">Survey Status</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {completed ? (
          <>
            <p className="text-lg font-semibold text-green-700" data-testid="survey-completed">
              Survey Completed
            </p>
            <p className="text-sm text-neutral-500 mt-1">
              Your skills survey has been submitted
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-neutral-600" data-testid="survey-pending">
              Not yet submitted
            </p>
            <p className="text-sm text-neutral-500 mt-1">
              Complete your survey to join the marketplace
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

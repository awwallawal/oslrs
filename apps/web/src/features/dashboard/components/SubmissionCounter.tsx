/**
 * Shared submission counter banner for survey/entry pages.
 *
 * Displays "Label: N" with skeleton loading and graceful error degradation.
 * Extracted from EnumeratorSurveysPage / ClerkSurveysPage / PublicSurveysPage
 * to eliminate duplicated counter logic (prep-2 code review).
 */

import { CheckCircle2 } from 'lucide-react';
import { SkeletonText } from '../../../components/skeletons';
import { useMySubmissionCounts } from '../../forms/hooks/useForms';

interface SubmissionCounterProps {
  label: string;
}

export function SubmissionCounter({ label }: SubmissionCounterProps) {
  const { data: counts, isLoading, error } = useMySubmissionCounts();
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;

  if (isLoading) {
    return (
      <div className="mb-4" data-testid="counter-loading">
        <SkeletonText width="200px" />
      </div>
    );
  }

  if (error) return null;

  return (
    <div className="flex items-center gap-2 mb-4 text-neutral-700" data-testid="submission-counter">
      <CheckCircle2 className="w-5 h-5 text-[#9C1E23]" />
      <span>{label}: <strong>{total}</strong></span>
    </div>
  );
}

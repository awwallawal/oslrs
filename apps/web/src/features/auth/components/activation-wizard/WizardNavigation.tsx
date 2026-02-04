import { ArrowLeft, ArrowRight, Loader2, Send } from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface WizardNavigationProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  isCurrentStepValid: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  className?: string;
}

/**
 * Navigation buttons for the activation wizard
 * Shows Back/Next for middle steps, Submit on last step
 */
export function WizardNavigation({
  isFirstStep,
  isLastStep,
  isCurrentStepValid,
  isSubmitting,
  onBack,
  onNext,
  onSubmit,
  className,
}: WizardNavigationProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        disabled={isFirstStep || isSubmitting}
        className={cn(
          'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
          'border border-neutral-300 bg-white text-neutral-700',
          'hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white',
          isFirstStep && 'invisible' // Keep space but hide on first step
        )}
        aria-label="Go back to previous step"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back</span>
      </button>

      {/* Next / Submit button */}
      {isLastStep ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-colors',
            'bg-primary-600 text-white',
            'hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600'
          )}
          aria-label={isSubmitting ? 'Submitting...' : 'Complete activation'}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Activating...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Complete Activation</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          disabled={!isCurrentStepValid || isSubmitting}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-colors',
            'bg-primary-600 text-white',
            'hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600'
          )}
          aria-label="Go to next step"
        >
          <span>Next</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

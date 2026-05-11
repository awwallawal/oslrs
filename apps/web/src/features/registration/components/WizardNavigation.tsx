import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Story 9-12 — shared step-level back/continue navigation. Each step renders
 * its own copy so step-internal validation can gate forward navigation
 * without round-tripping through the wizard frame.
 */

export interface WizardNavigationProps {
  onBack?: () => void;
  onContinue: () => void;
  backLabel?: string;
  continueLabel?: string;
  isContinueDisabled?: boolean;
  isSubmitting?: boolean;
  className?: string;
}

export function WizardNavigation({
  onBack,
  onContinue,
  backLabel = 'Back',
  continueLabel = 'Continue',
  isContinueDisabled,
  isSubmitting,
  className,
}: WizardNavigationProps) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      data-testid="wizard-navigation"
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          data-testid="wizard-nav-back"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
      ) : (
        <span aria-hidden="true" className="hidden sm:block sm:flex-1" />
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={isContinueDisabled || isSubmitting}
        className={cn(
          'inline-flex min-h-[56px] items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 sm:min-h-[48px] sm:flex-1',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          (isContinueDisabled || isSubmitting) && 'cursor-not-allowed opacity-50',
        )}
        data-testid="wizard-nav-continue"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {continueLabel}
        {!isSubmitting && <ArrowRight className="h-4 w-4" />}
      </button>
    </div>
  );
}

import { Check } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { STEP_LABELS, TOTAL_STEPS, type WizardStep } from './useActivationWizard';

interface WizardProgressBarProps {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  onStepClick?: (step: WizardStep) => void;
  className?: string;
}

/**
 * Visual progress indicator for the activation wizard
 * Shows completed steps with checkmarks, current step highlighted, and upcoming steps grayed
 */
export function WizardProgressBar({
  currentStep,
  completedSteps,
  onStepClick,
  className,
}: WizardProgressBarProps) {
  const steps = Array.from({ length: TOTAL_STEPS }, (_, i) => (i + 1) as WizardStep);

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop view - horizontal stepper */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = completedSteps.has(step);
            const isCurrent = step === currentStep;
            const isClickable = isCompleted || step === currentStep;

            return (
              <div key={step} className="flex items-center flex-1">
                {/* Step circle and label */}
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => isClickable && onStepClick?.(step)}
                    disabled={!isClickable}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
                      isCompleted && 'bg-primary-600 text-white',
                      isCurrent && !isCompleted && 'bg-primary-600 text-white ring-4 ring-primary-100',
                      !isCompleted && !isCurrent && 'bg-neutral-200 text-neutral-500',
                      isClickable && 'cursor-pointer hover:opacity-80',
                      !isClickable && 'cursor-not-allowed'
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`Step ${step}: ${STEP_LABELS[step]}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      step
                    )}
                  </button>
                  <span
                    className={cn(
                      'mt-2 text-xs font-medium text-center max-w-[80px]',
                      isCurrent && 'text-primary-700',
                      isCompleted && 'text-primary-600',
                      !isCompleted && !isCurrent && 'text-neutral-500'
                    )}
                  >
                    {STEP_LABELS[step]}
                  </span>
                </div>

                {/* Connector line (not after last step) */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-1 mx-2 rounded-full transition-colors',
                      completedSteps.has(step) ? 'bg-primary-600' : 'bg-neutral-200'
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile view - compact stepper */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-neutral-700">
            Step {currentStep} of {TOTAL_STEPS}
          </span>
          <span className="text-sm font-medium text-primary-600">
            {STEP_LABELS[currentStep]}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-600 transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
            role="progressbar"
            aria-valuenow={currentStep}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
          />
        </div>
        {/* Step dots */}
        <div className="flex justify-between mt-2">
          {steps.map((step) => {
            const isCompleted = completedSteps.has(step);
            const isCurrent = step === currentStep;

            return (
              <button
                key={step}
                type="button"
                onClick={() => (isCompleted || isCurrent) && onStepClick?.(step)}
                disabled={!isCompleted && !isCurrent}
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                  isCompleted && 'bg-primary-600 text-white',
                  isCurrent && !isCompleted && 'bg-primary-600 text-white',
                  !isCompleted && !isCurrent && 'bg-neutral-200 text-neutral-400',
                  (isCompleted || isCurrent) && 'cursor-pointer',
                  !isCompleted && !isCurrent && 'cursor-not-allowed'
                )}
                aria-label={`Step ${step}: ${STEP_LABELS[step]}`}
              >
                {isCompleted ? <Check className="w-3 h-3" /> : step}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

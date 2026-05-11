import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Story 9-12 AC#2 — Visible Step Indicator (Sally's Progress Pattern).
 *
 * Two variants in one component:
 *   - Desktop / tablet (>=480px): horizontal breadcrumb-style row above the
 *     wizard card. Completed circles are clickable (back-navigation via
 *     `onStepClick`). Current circle is filled Primary-600. Future circles
 *     are disabled neutral.
 *   - Mobile (<480px): collapses to a single text line "Step N of M — <label>".
 *
 * Persistently sticky so the user always sees where they are. Sticky
 * positioning is applied by the consuming WizardLayout (we keep the indicator
 * a pure presentational concern).
 *
 * Reused by Story 11-3 Admin Import wizard and AC#12 Staff Activation polish
 * (deferred to next session).
 */

export interface WizardStep {
  id: string;
  label: string;
}

export interface WizardStepIndicatorProps {
  steps: WizardStep[];
  currentStepIndex: number;
  /**
   * Optional click handler. Called only when the step has already been
   * completed (index < currentStepIndex). Forward navigation via clicking is
   * intentionally NOT supported — the user must complete the current step's
   * validation first.
   */
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export function WizardStepIndicator({
  steps,
  currentStepIndex,
  onStepClick,
  className,
}: WizardStepIndicatorProps) {
  const safeIndex = Math.max(0, Math.min(currentStepIndex, steps.length - 1));
  const currentStep = steps[safeIndex];

  return (
    <nav
      aria-label="Registration progress"
      className={cn('w-full', className)}
      data-testid="wizard-step-indicator"
    >
      {/* Desktop / tablet — horizontal breadcrumb. Hidden under 480px. */}
      <ol
        role="list"
        className="hidden sm:flex sm:items-center sm:justify-between sm:gap-2"
      >
        {steps.map((step, idx) => {
          const isComplete = idx < safeIndex;
          const isCurrent = idx === safeIndex;
          const isFuture = idx > safeIndex;
          const clickable = isComplete && !!onStepClick;
          return (
            <li
              key={step.id}
              className="flex flex-1 items-center"
              aria-current={isCurrent ? 'step' : undefined}
              data-testid={`wizard-step-${idx}`}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(idx)}
                className={cn(
                  'group flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                  clickable ? 'cursor-pointer' : 'cursor-default',
                )}
                aria-label={`Step ${idx + 1}: ${step.label}${isComplete ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                data-testid={`wizard-step-button-${idx}`}
              >
                <span
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    isComplete &&
                      'border-primary-600 bg-primary-600 text-white group-hover:bg-primary-700',
                    isCurrent && 'border-primary-600 bg-primary-600 text-white',
                    isFuture && 'border-neutral-300 bg-white text-neutral-400',
                  )}
                  aria-hidden="true"
                >
                  {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-sm',
                    isCurrent && 'font-semibold text-neutral-900',
                    isComplete && 'text-neutral-700',
                    isFuture && 'text-neutral-400',
                  )}
                >
                  {step.label}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mx-2 h-px flex-1 transition-colors',
                    isComplete ? 'bg-primary-600' : 'bg-neutral-200',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile — single text line. Hidden ≥480px. */}
      <div
        className="flex items-center justify-between sm:hidden"
        data-testid="wizard-step-indicator-mobile"
      >
        <span className="text-sm font-medium text-neutral-700">
          Step {safeIndex + 1} of {steps.length}
        </span>
        <span className="text-sm font-semibold text-neutral-900 truncate">
          {currentStep?.label ?? ''}
        </span>
      </div>
    </nav>
  );
}

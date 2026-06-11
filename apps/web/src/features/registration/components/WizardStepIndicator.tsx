import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Story 9-12 AC#2 — Visible Step Indicator (Sally's Progress Pattern).
 * Story 9-18 Part E (AC#E1/E5) — adaptive to a dynamic step count.
 *
 * Three presentations:
 *   - Breadcrumb (≤ COMPACT_THRESHOLD steps, desktop ≥480px): horizontal row of
 *     numbered circles. Completed circles are clickable (back-nav). Skipped
 *     section steps (AC#E5) render greyed + non-interactive.
 *   - Compact line (> COMPACT_THRESHOLD steps, all viewports): a single
 *     "Step N of M — <label>" line + a thin progress bar — because 11 labelled
 *     circles don't fit a breadcrumb. This is the format AC#E1 specifies
 *     ("Step 6 of 11 — Identity & Demographics").
 *   - Mobile (<480px, when not compact): the same single line.
 *
 * Sticky positioning is applied by the consuming WizardLayout.
 */

const COMPACT_THRESHOLD = 6;

export interface WizardStep {
  id: string;
  label: string;
  /** Story 9-18 AC#E5 — section step auto-skipped (all questions hidden). */
  skipped?: boolean;
}

export interface WizardStepIndicatorProps {
  steps: WizardStep[];
  currentStepIndex: number;
  /**
   * Optional click handler. Called only when the step has already been
   * completed (index < currentStepIndex) AND is not skipped. Forward navigation
   * via clicking is intentionally NOT supported.
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
  const compact = steps.length > COMPACT_THRESHOLD;
  const fillPercent = steps.length > 0 ? ((safeIndex + 1) / steps.length) * 100 : 0;

  return (
    <nav
      aria-label="Registration progress"
      className={cn('w-full', className)}
      data-testid="wizard-step-indicator"
      data-variant={compact ? 'compact' : 'breadcrumb'}
    >
      {/* Breadcrumb — only when the step count is small enough to fit. */}
      {!compact && (
        <ol role="list" className="hidden sm:flex sm:items-center sm:justify-between sm:gap-2">
          {steps.map((step, idx) => {
            const isComplete = idx < safeIndex;
            const isCurrent = idx === safeIndex;
            const isFuture = idx > safeIndex;
            const isSkipped = !!step.skipped;
            const clickable = isComplete && !isSkipped && !!onStepClick;
            return (
              <li
                key={step.id}
                className="flex flex-1 items-center"
                aria-current={isCurrent ? 'step' : undefined}
                data-testid={`wizard-step-${idx}`}
                data-skipped={isSkipped ? 'true' : undefined}
              >
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStepClick(idx)}
                  className={cn(
                    'group flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                    clickable ? 'cursor-pointer' : 'cursor-default',
                  )}
                  aria-label={`Step ${idx + 1}: ${step.label}${isSkipped ? ' (skipped)' : isComplete ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                  data-testid={`wizard-step-button-${idx}`}
                >
                  <span
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                      isSkipped && 'border-neutral-200 bg-neutral-100 text-neutral-300',
                      !isSkipped && isComplete &&
                        'border-primary-600 bg-primary-600 text-white group-hover:bg-primary-700',
                      !isSkipped && isCurrent && 'border-primary-600 bg-primary-600 text-white',
                      !isSkipped && isFuture && 'border-neutral-300 bg-white text-neutral-400',
                    )}
                    aria-hidden="true"
                  >
                    {isSkipped ? '–' : isComplete ? <Check className="h-4 w-4" /> : idx + 1}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-sm',
                      isSkipped && 'text-neutral-300 line-through',
                      !isSkipped && isCurrent && 'font-semibold text-neutral-900',
                      !isSkipped && isComplete && 'text-neutral-700',
                      !isSkipped && isFuture && 'text-neutral-400',
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
      )}

      {/* Compact line — used for many-step wizards (all viewports) and as the
          mobile fallback for the breadcrumb. */}
      <div className={cn('space-y-1.5', compact ? 'block' : 'sm:hidden')}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-neutral-700">
            Step {safeIndex + 1} of {steps.length}
          </span>
          <span className="truncate text-sm font-semibold text-neutral-900" data-testid="wizard-step-current-label">
            {currentStep?.label ?? ''}
          </span>
        </div>
        {compact && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
            <div
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        )}
      </div>
    </nav>
  );
}

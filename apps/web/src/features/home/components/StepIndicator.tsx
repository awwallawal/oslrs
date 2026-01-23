import { type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface StepIndicatorProps {
  /**
   * Step number (1-4)
   */
  step: number;
  /**
   * Step title
   */
  title: string;
  /**
   * Step description
   */
  description: string;
  /**
   * Lucide icon component
   */
  icon: LucideIcon;
  /**
   * Whether this is the last step (no connector after)
   * @default false
   */
  isLast?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * StepIndicator - Numbered step with icon and connector.
 *
 * Used in the "How It Works" section to show the registration flow.
 * Shows horizontal connectors on desktop, vertical on mobile.
 */
function StepIndicator({
  step,
  title,
  description,
  icon: Icon,
  isLast = false,
  className,
}: StepIndicatorProps) {
  return (
    <div className={cn('relative', className)}>
      {/* Connector line (hidden on last step) */}
      {!isLast && (
        <>
          {/* Horizontal connector - desktop */}
          <div className="hidden lg:block absolute top-8 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-0.5 bg-neutral-200" />
          {/* Vertical connector - mobile/tablet */}
          <div className="lg:hidden absolute top-16 left-8 w-0.5 h-[calc(100%-2rem)] bg-neutral-200" />
        </>
      )}

      <div className="flex flex-col items-center text-center">
        {/* Step number badge */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mb-4">
            <Icon className="w-7 h-7 text-primary-600" />
          </div>
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary-600 text-white text-sm font-semibold flex items-center justify-center">
            {step}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-neutral-600 max-w-[200px]">
          {description}
        </p>
      </div>
    </div>
  );
}

export { StepIndicator };
export type { StepIndicatorProps };

import { cn } from '../../lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Apply shimmer animation effect
   * @default true
   */
  animate?: boolean;
}

/**
 * Base Skeleton component (shadcn/ui pattern).
 * Used for loading states to preserve layout and reduce perceived load time.
 *
 * Accessibility: Includes aria-busy and aria-label for screen readers.
 *
 * @example
 * // Basic usage
 * <Skeleton className="h-12 w-full" />
 *
 * // Without animation
 * <Skeleton className="h-8 w-32" animate={false} />
 */
function Skeleton({ className, animate = true, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-neutral-200',
        animate && 'animate-shimmer',
        className
      )}
      aria-busy="true"
      aria-label="Loading"
      role="progressbar"
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonProps };

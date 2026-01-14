import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import { SkeletonText } from './SkeletonText';

interface SkeletonCardProps {
  /**
   * Show image placeholder at top of card
   * @default false
   */
  withImage?: boolean;
  /**
   * Number of text lines in the card body
   * @default 3
   */
  lines?: number;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SkeletonCard - Card-shaped placeholder for content cards.
 *
 * @example
 * // Basic card
 * <SkeletonCard />
 *
 * // Card with image
 * <SkeletonCard withImage />
 *
 * // Card with custom line count
 * <SkeletonCard lines={5} />
 */
function SkeletonCard({ withImage = false, lines = 3, className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-4 shadow-sm',
        className
      )}
      aria-busy="true"
      aria-label="Loading card"
    >
      {withImage && (
        <Skeleton className="mb-4 h-40 w-full rounded-md" />
      )}
      {/* Title */}
      <Skeleton className="mb-3 h-6 w-3/4" />
      {/* Body text */}
      <SkeletonText lines={lines} />
      {/* Action area */}
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}

export { SkeletonCard };
export type { SkeletonCardProps };

import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';

interface SkeletonTextProps {
  /**
   * Width of the text skeleton
   * @default 'full'
   */
  width?: 'full' | 'lg' | 'md' | 'sm' | 'xs' | string;
  /**
   * Number of lines to display
   * @default 1
   */
  lines?: number;
  /**
   * Additional CSS classes
   */
  className?: string;
}

const widthMap: Record<string, string> = {
  full: 'w-full',
  lg: 'w-3/4',
  md: 'w-1/2',
  sm: 'w-1/3',
  xs: 'w-1/4',
};

/**
 * SkeletonText - Single or multi-line text placeholder.
 *
 * @example
 * // Single line, full width
 * <SkeletonText />
 *
 * // Two lines with varying widths
 * <SkeletonText lines={2} />
 *
 * // Custom width
 * <SkeletonText width="md" />
 */
function SkeletonText({ width = 'full', lines = 1, className }: SkeletonTextProps) {
  const widthClass = widthMap[width] || width;

  if (lines === 1) {
    return (
      <Skeleton
        className={cn('h-4', widthClass, className)}
        aria-label="Loading text"
      />
    );
  }

  return (
    <div className={cn('space-y-2', className)} aria-label="Loading text">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            'h-4',
            // Last line is shorter to look more natural
            index === lines - 1 ? 'w-2/3' : widthClass
          )}
        />
      ))}
    </div>
  );
}

export { SkeletonText };
export type { SkeletonTextProps };

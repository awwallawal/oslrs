import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';

interface SkeletonAvatarProps {
  /**
   * Size of the avatar
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Show accompanying text lines
   * @default false
   */
  withText?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

const sizeMap: Record<string, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

/**
 * SkeletonAvatar - Circular placeholder for user avatars/profile images.
 *
 * @example
 * // Basic avatar
 * <SkeletonAvatar />
 *
 * // Avatar with text (name + subtitle)
 * <SkeletonAvatar withText />
 *
 * // Large avatar
 * <SkeletonAvatar size="lg" />
 */
function SkeletonAvatar({ size = 'md', withText = false, className }: SkeletonAvatarProps) {
  const sizeClass = sizeMap[size];

  if (!withText) {
    return (
      <Skeleton
        className={cn('rounded-full', sizeClass, className)}
        aria-label="Loading avatar"
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)} aria-label="Loading user info">
      <Skeleton className={cn('rounded-full flex-shrink-0', sizeClass)} />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export { SkeletonAvatar };
export type { SkeletonAvatarProps };

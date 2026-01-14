/**
 * Skeleton Components - Loading state placeholders
 *
 * These components provide animated skeleton screens for loading states,
 * following the PRD 1.4.1 requirement for shimmer skeletons (not spinners).
 *
 * All components include proper accessibility attributes (aria-busy, aria-label).
 *
 * @example
 * import { SkeletonText, SkeletonCard, SkeletonTable } from '@/components/skeletons';
 *
 * // Usage in a component
 * if (isLoading) {
 *   return <SkeletonCard withImage />;
 * }
 */

export { Skeleton } from '../ui/skeleton';
export type { SkeletonProps } from '../ui/skeleton';

export { SkeletonText } from './SkeletonText';
export type { SkeletonTextProps } from './SkeletonText';

export { SkeletonCard } from './SkeletonCard';
export type { SkeletonCardProps } from './SkeletonCard';

export { SkeletonAvatar } from './SkeletonAvatar';
export type { SkeletonAvatarProps } from './SkeletonAvatar';

export { SkeletonTable } from './SkeletonTable';
export type { SkeletonTableProps } from './SkeletonTable';

export { SkeletonForm } from './SkeletonForm';
export type { SkeletonFormProps } from './SkeletonForm';

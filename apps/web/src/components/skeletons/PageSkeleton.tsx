import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import { SkeletonText } from './SkeletonText';
import { SkeletonCard } from './SkeletonCard';

interface PageSkeletonProps {
  /**
   * Show header skeleton
   * @default true
   */
  showHeader?: boolean;
  /**
   * Show footer skeleton
   * @default true
   */
  showFooter?: boolean;
  /**
   * Variant for content area
   * @default 'default'
   */
  variant?: 'default' | 'cards' | 'form';
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * PageSkeleton - Full page loading skeleton.
 *
 * Provides a shimmer loading state for entire pages,
 * matching the PublicLayout structure with header, content, and footer.
 *
 * Uses existing SkeletonCard, SkeletonText components.
 * Uses Oyo State brand colors in gradients (via animate-shimmer).
 *
 * @example
 * // Default page skeleton
 * <PageSkeleton />
 *
 * // Cards layout variant
 * <PageSkeleton variant="cards" />
 *
 * // Form layout variant without header
 * <PageSkeleton variant="form" showHeader={false} />
 */
function PageSkeleton({
  showHeader = true,
  showFooter = true,
  variant = 'default',
  className,
}: PageSkeletonProps) {
  return (
    <div
      className={cn('min-h-screen flex flex-col bg-neutral-50', className)}
      aria-busy="true"
      aria-label="Loading page"
    >
      {/* Header Skeleton */}
      {showHeader && (
        <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-5 w-16 hidden sm:block" />
              </div>

              {/* Nav items - hidden on mobile */}
              <div className="hidden md:flex items-center gap-6">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>

              {/* CTAs */}
              <div className="hidden md:flex items-center gap-3">
                <Skeleton className="h-9 w-20 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>

              {/* Mobile menu button */}
              <Skeleton className="h-10 w-10 rounded-md md:hidden" />
            </div>
          </div>
        </header>
      )}

      {/* Main Content Skeleton */}
      <main className="flex-1">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {variant === 'default' && (
            <div className="space-y-8">
              {/* Hero section */}
              <div className="max-w-3xl">
                <Skeleton className="h-10 w-2/3 mb-4" />
                <SkeletonText lines={3} width="full" />
              </div>

              {/* Content sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <SkeletonCard withImage />
                <SkeletonCard withImage />
                <SkeletonCard withImage />
              </div>

              {/* Additional content */}
              <div className="max-w-4xl">
                <Skeleton className="h-8 w-1/3 mb-4" />
                <SkeletonText lines={4} />
              </div>
            </div>
          )}

          {variant === 'cards' && (
            <div className="space-y-6">
              {/* Page title */}
              <Skeleton className="h-10 w-1/3" />

              {/* Cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonCard key={index} withImage lines={2} />
                ))}
              </div>
            </div>
          )}

          {variant === 'form' && (
            <div className="max-w-md mx-auto space-y-6">
              {/* Form title */}
              <Skeleton className="h-8 w-2/3 mx-auto" />

              {/* Form fields */}
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ))}
              </div>

              {/* Submit button */}
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          )}
        </div>
      </main>

      {/* Footer Skeleton */}
      {showFooter && (
        <footer className="bg-neutral-900">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Brand column */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-10 w-10 rounded-lg bg-neutral-700" />
                  <Skeleton className="h-5 w-16 bg-neutral-700" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full bg-neutral-700" />
                  <Skeleton className="h-3 w-4/5 bg-neutral-700" />
                </div>
              </div>

              {/* Link columns */}
              {Array.from({ length: 3 }).map((_, colIndex) => (
                <div key={colIndex}>
                  <Skeleton className="h-4 w-24 mb-4 bg-neutral-700" />
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, linkIndex) => (
                      <Skeleton
                        key={linkIndex}
                        className="h-3 w-20 bg-neutral-700"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Copyright */}
            <div className="mt-12 pt-8 border-t border-neutral-800">
              <Skeleton className="h-3 w-64 mx-auto bg-neutral-700" />
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export { PageSkeleton };
export type { PageSkeletonProps };

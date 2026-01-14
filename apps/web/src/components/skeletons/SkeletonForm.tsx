import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';

interface SkeletonFormProps {
  /**
   * Number of form fields to display
   * @default 4
   */
  fields?: number;
  /**
   * Show submit button
   * @default true
   */
  withButton?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SkeletonForm - Form fields placeholder for forms.
 *
 * @example
 * // Default form (4 fields)
 * <SkeletonForm />
 *
 * // Custom field count
 * <SkeletonForm fields={6} />
 *
 * // Without button
 * <SkeletonForm withButton={false} />
 */
function SkeletonForm({
  fields = 4,
  withButton = true,
  className,
}: SkeletonFormProps) {
  return (
    <div
      className={cn('space-y-6', className)}
      aria-busy="true"
      aria-label="Loading form"
    >
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          {/* Label */}
          <Skeleton className="h-4 w-24" />
          {/* Input */}
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}

      {withButton && (
        <div className="pt-2">
          <Skeleton className="h-10 w-full rounded-md sm:w-32" />
        </div>
      )}
    </div>
  );
}

export { SkeletonForm };
export type { SkeletonFormProps };

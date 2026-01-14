import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';

interface SkeletonTableProps {
  /**
   * Number of columns
   * @default 4
   */
  columns?: number;
  /**
   * Number of rows
   * @default 5
   */
  rows?: number;
  /**
   * Show table header
   * @default true
   */
  withHeader?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SkeletonTable - Table rows placeholder for data tables.
 *
 * @example
 * // Default table (4 columns, 5 rows)
 * <SkeletonTable />
 *
 * // Custom dimensions
 * <SkeletonTable columns={6} rows={10} />
 *
 * // Without header
 * <SkeletonTable withHeader={false} />
 */
function SkeletonTable({
  columns = 4,
  rows = 5,
  withHeader = true,
  className,
}: SkeletonTableProps) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-lg border border-neutral-200', className)}
      aria-busy="true"
      aria-label="Loading table"
    >
      <table className="w-full">
        {withHeader && (
          <thead className="bg-neutral-50">
            <tr>
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="px-4 py-3 text-left">
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-neutral-200 bg-white">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="px-4 py-3">
                  <Skeleton
                    className={cn(
                      'h-4',
                      // Vary widths for more natural appearance
                      colIndex === 0 ? 'w-24' :
                      colIndex === columns - 1 ? 'w-16' :
                      'w-full max-w-[120px]'
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { SkeletonTable };
export type { SkeletonTableProps };

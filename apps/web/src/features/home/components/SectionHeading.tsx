import { cn } from '../../../lib/utils';

interface SectionHeadingProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Optional subheading text
   */
  subtitle?: string;
  /**
   * Center align the heading
   * @default false
   */
  centered?: boolean;
}

/**
 * SectionHeading - Reusable H2 section heading pattern.
 *
 * All section headings use H2 (only Hero uses H1).
 * Implements the typography scale from design tokens.
 */
function SectionHeading({
  children,
  className,
  subtitle,
  centered = false,
}: SectionHeadingProps) {
  return (
    <div className={cn('mb-10 lg:mb-12', centered && 'text-center', className)}>
      <h2 className="text-3xl lg:text-4xl font-brand font-semibold text-neutral-900">
        {children}
      </h2>
      {subtitle && (
        <p className="mt-4 text-lg text-neutral-600 max-w-3xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export { SectionHeading };
export type { SectionHeadingProps };

import { cn } from '../../../lib/utils';

interface SectionWrapperProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Background color variant
   * @default 'default'
   */
  variant?: 'default' | 'light' | 'dark' | 'primary';
  /**
   * ID for skip link navigation
   */
  id?: string;
}

/**
 * SectionWrapper - Consistent section container with padding.
 *
 * Provides the container pattern used across all homepage sections:
 * - Vertical padding (py-16 lg:py-24)
 * - Centered container with responsive horizontal padding
 * - Optional background variants
 */
function SectionWrapper({
  children,
  className,
  variant = 'default',
  id,
}: SectionWrapperProps) {
  const variantClasses = {
    default: 'bg-white',
    light: 'bg-neutral-50',
    dark: 'bg-neutral-900 text-white',
    primary: 'bg-primary-50',
  };

  return (
    <section
      id={id}
      className={cn('py-16 lg:py-24', variantClasses[variant], className)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}

export { SectionWrapper };
export type { SectionWrapperProps };

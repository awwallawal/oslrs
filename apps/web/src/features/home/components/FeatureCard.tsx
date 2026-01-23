import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Card, CardContent } from '../../../components/ui/card';

interface FeatureCardProps {
  /**
   * Card title (H3)
   */
  title: string;
  /**
   * Card description
   */
  description: string;
  /**
   * Lucide icon component
   */
  icon: LucideIcon;
  /**
   * Link text for CTA
   */
  linkText: string;
  /**
   * Link destination
   */
  linkHref: string;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * FeatureCard - Reusable card for participant types and features.
 *
 * Uses shadcn Card component with icon, title, description, and CTA link.
 */
function FeatureCard({
  title,
  description,
  icon: Icon,
  linkText,
  linkHref,
  className,
}: FeatureCardProps) {
  return (
    <Card className={cn('h-full border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all', className)}>
      <CardContent className="pt-6">
        <div className="flex flex-col h-full">
          {/* Icon */}
          <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center mb-4">
            <Icon className="w-6 h-6 text-primary-600" />
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            {title}
          </h3>

          {/* Description */}
          <p className="text-neutral-600 mb-4 flex-1">
            {description}
          </p>

          {/* CTA Link */}
          <Link
            to={linkHref}
            className="inline-flex items-center gap-1 text-primary-600 font-medium hover:text-primary-700 transition-colors group"
          >
            {linkText}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export { FeatureCard };
export type { FeatureCardProps };

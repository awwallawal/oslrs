import { Lightbulb, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type TipVariant = 'info' | 'warning' | 'success';

interface TipCardProps {
  title?: string;
  children: ReactNode;
  variant?: TipVariant;
}

const variantStyles: Record<TipVariant, { bg: string; border: string; icon: string; iconComponent: typeof Lightbulb }> = {
  info: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    icon: 'text-primary-600',
    iconComponent: Lightbulb,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    iconComponent: AlertTriangle,
  },
  success: {
    bg: 'bg-success-50',
    border: 'border-success-200',
    icon: 'text-success-600',
    iconComponent: CheckCircle,
  },
};

/**
 * TipCard - Callout component for helpful information in guide pages.
 *
 * Variants:
 * - info (default): Blue, for helpful tips
 * - warning: Amber, for important notices
 * - success: Green, for success/completion info
 */
function TipCard({ title = 'Tip', children, variant = 'info' }: TipCardProps) {
  const styles = variantStyles[variant];
  const IconComponent = styles.iconComponent;

  return (
    <div className={`rounded-lg border ${styles.bg} ${styles.border} p-4`}>
      <div className="flex items-start gap-3">
        <IconComponent className={`w-5 h-5 ${styles.icon} flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div>
          <h4 className="font-semibold text-neutral-900 mb-1">{title}</h4>
          <div className="text-sm text-neutral-700">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { TipCard };
export type { TipCardProps, TipVariant };

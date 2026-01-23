import { ReactNode } from 'react';
import { Info, AlertCircle, CheckCircle2 } from 'lucide-react';

type CalloutVariant = 'info' | 'warning' | 'success' | 'highlight';

interface AboutCalloutProps {
  /** Callout title (optional) */
  title?: string;
  /** Content - can be text or JSX */
  children: ReactNode;
  /** Visual variant */
  variant?: CalloutVariant;
  /** Additional CSS classes */
  className?: string;
}

const variantStyles: Record<CalloutVariant, { bg: string; border: string; icon: typeof Info; iconColor: string }> = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Info,
    iconColor: 'text-blue-600',
  },
  warning: {
    bg: 'bg-warning-50',
    border: 'border-warning-200',
    icon: AlertCircle,
    iconColor: 'text-warning-600',
  },
  success: {
    bg: 'bg-success-50',
    border: 'border-success-200',
    icon: CheckCircle2,
    iconColor: 'text-success-600',
  },
  highlight: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    icon: Info,
    iconColor: 'text-primary-600',
  },
};

/**
 * AboutCallout - Highlighted info box for important information.
 *
 * Used for TL;DR boxes, NIN info callouts, etc.
 */
function AboutCallout({
  title,
  children,
  variant = 'info',
  className = '',
}: AboutCalloutProps) {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <div
      className={`rounded-xl border-2 ${styles.bg} ${styles.border} p-6 ${className}`}
    >
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <Icon className={`w-6 h-6 ${styles.iconColor}`} />
        </div>
        <div className="flex-1">
          {title && (
            <h3 className="font-semibold text-neutral-900 mb-2">{title}</h3>
          )}
          <div className="text-neutral-700">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { AboutCallout };

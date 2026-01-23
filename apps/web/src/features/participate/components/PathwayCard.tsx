import { Link } from 'react-router-dom';
import { LucideIcon, ArrowRight } from 'lucide-react';

interface PathwayCardProps {
  /** Card title */
  title: string;
  /** Card description */
  description: string;
  /** List of benefits */
  benefits: string[];
  /** Lucide icon component */
  icon: LucideIcon;
  /** CTA link text */
  ctaText: string;
  /** CTA link href */
  ctaHref: string;
  /** Optional variant for different styling */
  variant?: 'worker' | 'employer';
}

/**
 * PathwayCard - Large card for choosing worker or employer path.
 *
 * Used on Participate landing page for "I Am A..." section.
 */
function PathwayCard({
  title,
  description,
  benefits,
  icon: Icon,
  ctaText,
  ctaHref,
  variant = 'worker',
}: PathwayCardProps) {
  const variantStyles = {
    worker: {
      iconBg: 'bg-primary-100',
      iconColor: 'text-primary-600',
      ctaBg: 'bg-primary-600 hover:bg-primary-700',
    },
    employer: {
      iconBg: 'bg-success-100',
      iconColor: 'text-success-600',
      ctaBg: 'bg-success-600 hover:bg-success-700',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 lg:p-8 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
      {/* Icon */}
      <div className={`w-16 h-16 rounded-xl ${styles.iconBg} flex items-center justify-center mb-6`}>
        <Icon className={`w-8 h-8 ${styles.iconColor}`} />
      </div>

      {/* Title */}
      <h3 className="text-xl lg:text-2xl font-semibold text-neutral-900 mb-3">
        {title}
      </h3>

      {/* Description */}
      <p className="text-neutral-600 mb-6">{description}</p>

      {/* Benefits */}
      <ul className="space-y-3 mb-8 flex-1">
        {benefits.map((benefit, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className={`w-5 h-5 rounded-full ${styles.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <svg className={`w-3 h-3 ${styles.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="text-neutral-700">{benefit}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        to={ctaHref}
        className={`inline-flex items-center justify-center gap-2 px-6 py-3 ${styles.ctaBg} text-white font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors`}
      >
        {ctaText}
        <ArrowRight className="w-5 h-5" />
      </Link>
    </div>
  );
}

export { PathwayCard };

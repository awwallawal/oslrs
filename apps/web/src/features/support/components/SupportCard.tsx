import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface SupportCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  fullWidth?: boolean;
}

/**
 * SupportCard - Quick link card for Support section navigation.
 *
 * Used on Support landing page for FAQ, Guides, Contact, and Verify Worker links.
 */
function SupportCard({ title, description, icon: Icon, href, fullWidth = false }: SupportCardProps) {
  return (
    <Link
      to={href}
      className={`group block bg-white rounded-xl border border-neutral-200 p-6 hover:border-primary-300 hover:shadow-md transition-all ${
        fullWidth ? 'md:col-span-3' : ''
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
            <Icon className="w-6 h-6 text-primary-600" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-neutral-600 mt-1">{description}</p>
        </div>
      </div>
    </Link>
  );
}

export { SupportCard };

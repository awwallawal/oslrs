import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface GuideCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  external?: boolean;
}

/**
 * GuideCard - Preview card for guides with "Read Guide" link.
 *
 * Used on Guides page for worker and employer how-to guides.
 */
function GuideCard({ title, description, icon: Icon, href, external = false }: GuideCardProps) {
  const linkProps = external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  const CardContent = (
    <div className="group bg-white rounded-xl border border-neutral-200 p-5 hover:border-primary-300 hover:shadow-md transition-all h-full flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
          <Icon className="w-5 h-5 text-primary-600" />
        </div>
        <h3 className="font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors">
          {title}
        </h3>
      </div>
      <p className="text-sm text-neutral-600 flex-1">{description}</p>
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary-600 group-hover:text-primary-700">
        Read Guide
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );

  if (external) {
    return (
      <a href={href} {...linkProps}>
        {CardContent}
      </a>
    );
  }

  return <Link to={href}>{CardContent}</Link>;
}

export { GuideCard };

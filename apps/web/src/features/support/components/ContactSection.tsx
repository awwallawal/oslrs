import type { LucideIcon } from 'lucide-react';

interface ContactItem {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}

interface ContactSectionProps {
  title: string;
  description?: string;
  items: ContactItem[];
}

/**
 * ContactSection - Reusable section for contact information.
 *
 * Used on Contact page for different department contact details.
 */
function ContactSection({ title, description, items }: ContactSectionProps) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <h3 className="font-semibold text-lg text-neutral-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-neutral-600 mb-4">{description}</p>
      )}
      <div className="space-y-3">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={index} className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-primary-600 flex-shrink-0" />
              <div className="text-sm">
                <span className="text-neutral-500">{item.label}: </span>
                {item.href ? (
                  <a
                    href={item.href}
                    className="text-neutral-900 font-medium hover:text-primary-600 transition-colors"
                  >
                    {item.value}
                  </a>
                ) : (
                  <span className="text-neutral-900 font-medium">{item.value}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ContactSection };

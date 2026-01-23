import { LucideIcon } from 'lucide-react';

interface BenefitCardProps {
  /** Card title */
  title: string;
  /** Card description */
  description: string;
  /** Lucide icon component */
  icon: LucideIcon;
}

/**
 * BenefitCard - Simple card showing a benefit with icon.
 *
 * Used on Initiative page for "How Your Data Helps" section.
 */
function BenefitCard({ title, description, icon: Icon }: BenefitCardProps) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 hover:border-primary-300 hover:shadow-sm transition-all">
      <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary-600" />
      </div>
      <h3 className="font-semibold text-neutral-900 mb-2">{title}</h3>
      <p className="text-sm text-neutral-600">{description}</p>
    </div>
  );
}

export { BenefitCard };

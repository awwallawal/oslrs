import { LucideIcon } from 'lucide-react';

interface WorkerCategoryCardProps {
  /** Category title */
  title: string;
  /** Examples of workers in this category */
  examples: string[];
  /** Lucide icon component */
  icon: LucideIcon;
}

/**
 * WorkerCategoryCard - Card showing a worker category with examples.
 *
 * Used on Workers page for "Who Should Register?" section.
 */
function WorkerCategoryCard({ title, examples, icon: Icon }: WorkerCategoryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 hover:border-primary-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-600" />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900 mb-2">{title}</h3>
          <p className="text-sm text-neutral-600">
            {examples.join(', ')}
          </p>
        </div>
      </div>
    </div>
  );
}

export { WorkerCategoryCard };

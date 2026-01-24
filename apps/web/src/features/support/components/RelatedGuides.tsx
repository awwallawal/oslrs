import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface RelatedGuide {
  href: string;
  title: string;
  description: string;
}

interface RelatedGuidesProps {
  guides: RelatedGuide[];
}

/**
 * RelatedGuides - Section displaying related guide links.
 *
 * Used at the bottom of guide detail pages.
 */
function RelatedGuides({ guides }: RelatedGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-neutral-200">
      <h2 className="text-lg font-semibold text-neutral-900 mb-4">Related Guides</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {guides.map((guide) => (
          <Link
            key={guide.href}
            to={guide.href}
            className="group block p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-primary-300 hover:bg-white transition-all"
          >
            <h3 className="font-medium text-neutral-900 group-hover:text-primary-600 transition-colors mb-1">
              {guide.title}
            </h3>
            <p className="text-sm text-neutral-600 mb-2">{guide.description}</p>
            <span className="inline-flex items-center text-sm font-medium text-primary-600 group-hover:text-primary-700">
              Read Guide
              <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export { RelatedGuides };
export type { RelatedGuide, RelatedGuidesProps };

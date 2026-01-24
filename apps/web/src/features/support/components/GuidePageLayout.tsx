import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { RelatedGuides } from './RelatedGuides';
import type { RelatedGuide } from './RelatedGuides';

interface Prerequisite {
  text: string;
}

interface GuidePageLayoutProps {
  title: string;
  estimatedTime: string;
  prerequisites?: Prerequisite[];
  children: ReactNode;
  relatedGuides?: RelatedGuide[];
}

/**
 * GuidePageLayout - Consistent layout for all guide detail pages.
 *
 * Provides:
 * - Back to Guides link
 * - Title with time estimate badge
 * - Prerequisites section (optional)
 * - Content area for steps and additional info
 * - Related Guides section (optional)
 */
function GuidePageLayout({
  title,
  estimatedTime,
  prerequisites,
  children,
  relatedGuides,
}: GuidePageLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header with back link */}
      <div className="bg-neutral-50 border-b border-neutral-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            to="/support/guides"
            className="inline-flex items-center text-sm text-neutral-600 hover:text-primary-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Guides
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-10 lg:py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-brand font-semibold text-neutral-900 mb-4">
              {title}
            </h1>
            <div className="flex items-center gap-2 text-neutral-600">
              <Clock className="w-5 h-5" aria-hidden="true" />
              <span>Estimated time: {estimatedTime}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-10 lg:py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            {/* Prerequisites */}
            {prerequisites && prerequisites.length > 0 && (
              <div className="mb-10 p-6 bg-neutral-50 rounded-lg border border-neutral-200">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Before You Start</h2>
                <ul className="space-y-2">
                  {prerequisites.map((prereq, index) => (
                    <li key={index} className="flex items-start gap-2 text-neutral-700">
                      <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{prereq.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Main Content */}
            {children}

            {/* Related Guides */}
            {relatedGuides && relatedGuides.length > 0 && (
              <RelatedGuides guides={relatedGuides} />
            )}

            {/* Bottom Back Link */}
            <div className="mt-12 pt-6 border-t border-neutral-200">
              <Link
                to="/support/guides"
                className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to All Guides
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export { GuidePageLayout };
export type { GuidePageLayoutProps, Prerequisite };

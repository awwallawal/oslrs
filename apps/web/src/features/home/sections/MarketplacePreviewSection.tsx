import { Link } from 'react-router-dom';
import { Search, BadgeCheck, ArrowRight } from 'lucide-react';
import { SectionWrapper, SectionHeading } from '../components';

/**
 * MarketplacePreviewSection - "Find Verified Local Talent" preview.
 *
 * Phase 1 placeholder - marketplace not ready.
 * Shows search teaser and government verified badge info.
 */
function MarketplacePreviewSection() {
  return (
    <SectionWrapper variant="default" id="marketplace">
      <div className="max-w-4xl mx-auto text-center">
        <SectionHeading centered>
          Find Verified Local Talent
        </SectionHeading>

        <p className="text-lg text-neutral-600 mb-8 max-w-2xl mx-auto">
          Connect with skilled artisans and professionals in your LGA.
        </p>

        {/* Placeholder search form */}
        <div className="bg-neutral-100 rounded-2xl p-8 mb-8">
          <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search skills (e.g., Electrician, Tailor)..."
                disabled
                className="w-full pl-12 pr-4 py-3 rounded-lg border border-neutral-300 bg-white text-neutral-400 cursor-not-allowed"
              />
            </div>
            <button
              disabled
              className="px-6 py-3 bg-neutral-300 text-neutral-500 font-medium rounded-lg cursor-not-allowed"
            >
              Search
            </button>
          </div>
          <p className="text-sm text-neutral-500 mt-4">
            Skills marketplace coming soon
          </p>
        </div>

        {/* Government Verified Badge info */}
        <div className="inline-flex items-center gap-3 bg-success-100 text-success-600 px-6 py-3 rounded-full mb-8">
          <BadgeCheck className="w-5 h-5" />
          <span className="font-medium">All workers are government verified</span>
        </div>

        {/* Link to employers info */}
        <div>
          <Link
            to="/participate/employers"
            className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors group"
          >
            Learn more about hiring verified workers
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </SectionWrapper>
  );
}

export { MarketplacePreviewSection };

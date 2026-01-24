import { Link } from 'react-router-dom';
import { GuidePageLayout, StepList, TipCard } from '../../components';

const prerequisites = [
  { text: 'None for basic search (public)' },
  { text: 'Employer account required to view contact details' },
];

const steps = [
  {
    title: 'Go to the Marketplace',
    description: 'Visit the OSLSR Marketplace page from the main navigation. The marketplace is publicly accessible for browsing.',
  },
  {
    title: 'Use the search bar or filters',
    description: 'Enter keywords related to the skills you\'re looking for, or use the category filters to narrow down results.',
  },
  {
    title: 'Filter by skill, location, availability',
    description: 'Refine your search using filters for specific skills, LGA/location, experience level, and availability status.',
  },
  {
    title: 'View worker profiles',
    description: 'Click on a worker profile to see their skills, experience, and verification status. Anonymized profiles protect worker privacy until contact is requested.',
  },
  {
    title: 'Contact workers',
    description: 'To view contact details and reach out to workers, you\'ll need to sign in with an employer account. Contact reveals are logged for accountability.',
  },
];

const relatedGuides = [
  {
    href: '/support/guides/employer-account',
    title: 'Setting Up an Employer Account',
    description: 'Create an employer account to access worker contact details.',
  },
  {
    href: '/support/guides/verify-worker',
    title: 'How to Verify a Worker',
    description: 'Confirm a worker\'s registration status before hiring.',
  },
];

/**
 * GuideSearchMarketplacePage - How to Search the Marketplace guide.
 *
 * Story 1.5.7 AC5
 */
function GuideSearchMarketplacePage() {
  return (
    <GuidePageLayout
      title="How to Search the Marketplace"
      estimatedTime="Instant"
      prerequisites={prerequisites}
      relatedGuides={relatedGuides}
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Step-by-Step Instructions</h2>
          <StepList steps={steps} />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Tips for Effective Searching</h2>
          <div className="space-y-4">
            <TipCard title="Use specific skill keywords" variant="info">
              <p>
                Search for specific skills like "plumber", "electrician", or "carpenter" rather than
                general terms like "worker" for better results.
              </p>
            </TipCard>
            <TipCard title="Check verification badges" variant="info">
              <p>
                Look for the government verification badge on worker profiles. This indicates their
                NIN has been validated and identity confirmed.
              </p>
            </TipCard>
            <TipCard title="Respect worker privacy" variant="warning">
              <p>
                Contact information is provided solely for legitimate employment purposes. Misuse of
                contact details may result in account suspension.
              </p>
            </TipCard>
          </div>
        </section>

        {/* CTA to Marketplace */}
        <section className="mt-8 p-6 bg-primary-50 rounded-lg border border-primary-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">Start Searching</h2>
          <p className="text-neutral-600 mb-4">
            Find verified skilled workers in Oyo State for your projects and business needs.
          </p>
          <Link
            to="/marketplace"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors"
          >
            Go to Marketplace
          </Link>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideSearchMarketplacePage;

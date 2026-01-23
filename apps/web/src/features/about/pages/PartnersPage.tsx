import { Mail } from 'lucide-react';
import { AboutPageWrapper, PartnerLogoCard } from '../components';

/**
 * Government agency partners
 */
const governmentPartners = [
  {
    name: 'Ministry of Labour & Productivity',
    placeholderKey: 'ministry-labour',
  },
  {
    name: 'Oyo State Bureau of Statistics',
    placeholderKey: 'bureau-statistics',
  },
  {
    name: 'National Bureau of Statistics (Advisory)',
    placeholderKey: 'nbs-advisory',
  },
];

/**
 * Industry association partners
 */
const industryPartners = [
  {
    name: 'Oyo State Chamber of Commerce',
    placeholderKey: 'chamber-commerce',
  },
  {
    name: 'Association of Nigerian Artisans',
    placeholderKey: 'artisans-association',
  },
];

/**
 * PartnersPage - Lists partner organizations and agencies.
 *
 * Content from docs/public-website-ia.md Section 3.5.
 * NOTE: Partner logos to be provided later.
 */
function PartnersPage() {
  return (
    <AboutPageWrapper
      title="Partners"
      subtitle="Organizations collaborating on the OSLSR initiative"
    >
      {/* Introduction */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-6">
              Organizations Supporting the OSLSR
            </h2>
            <p className="text-lg text-neutral-600">
              The success of the Oyo State Labour & Skills Registry depends on
              collaboration between government agencies, industry associations, and
              community organizations. Together, we're building a comprehensive
              workforce database that benefits everyone.
            </p>
          </div>
        </div>
      </section>

      {/* Government Agencies */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Government Agencies
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {governmentPartners.map((partner) => (
                <PartnerLogoCard
                  key={partner.placeholderKey}
                  name={partner.name}
                  placeholderKey={partner.placeholderKey}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Industry Associations */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Industry Associations
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {industryPartners.map((partner) => (
                <PartnerLogoCard
                  key={partner.placeholderKey}
                  name={partner.name}
                  placeholderKey={partner.placeholderKey}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Become a Partner CTA */}
      <section className="py-12 lg:py-16 bg-primary-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4">
              Become a Partner
            </h2>
            <p className="text-neutral-600 mb-8">
              Is your organization interested in supporting the OSLSR initiative?
              We welcome partnerships with government agencies, industry
              associations, NGOs, and educational institutions.
            </p>

            <div className="inline-flex flex-col sm:flex-row items-center gap-4">
              <a
                href="mailto:partnerships@oyostate.gov.ng"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                <Mail className="w-5 h-5" />
                Contact Us
              </a>
              <span className="text-neutral-600 text-sm">
                partnerships@oyostate.gov.ng
              </span>
            </div>
          </div>
        </div>
      </section>
    </AboutPageWrapper>
  );
}

export default PartnersPage;

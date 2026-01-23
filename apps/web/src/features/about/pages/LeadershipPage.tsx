import { Mail, MapPin } from 'lucide-react';
import { AboutPageWrapper, ProfileCard } from '../components';

/**
 * LeadershipPage - Showcases ministry leadership and oversight.
 *
 * Content from docs/public-website-ia.md Section 3.4.
 * NOTE: Real names/photos to be provided by Ministry later.
 */
function LeadershipPage() {
  return (
    <AboutPageWrapper
      title="Leadership"
      subtitle="Meet the team driving the OSLSR initiative"
    >
      {/* Leadership Profiles Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              The Team Behind OSLSR
            </h2>

            <div className="space-y-8">
              {/* Commissioner Profile */}
              <ProfileCard
                name="Hon. [Name]"
                title="Commissioner for Labour & Productivity"
                quote="The OSLSR represents our commitment to understanding and empowering Oyo State's workforce. For the first time, we will have accurate data to drive real policy decisions."
                placeholderKey="commissioner"
              />

              {/* Project Director Profile */}
              <ProfileCard
                name="[Name]"
                title="Project Director, OSLSR"
                description="Responsible for the day-to-day implementation of the registry, coordination with LGA supervisors, and data quality oversight."
                placeholderKey="project-director"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Oversight Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Government Oversight
            </h2>

            <p className="text-center text-neutral-600 mb-10 max-w-2xl mx-auto">
              The OSLSR operates under the authority of the Oyo State Ministry of
              Labour & Productivity, with oversight from the Office of the Governor.
            </p>

            {/* Government Seals */}
            <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-16">
              <div className="text-center">
                <img
                  src="/images/oyo-coat-of-arms.png"
                  alt="Oyo State Coat of Arms"
                  className="h-24 lg:h-32 w-auto mx-auto mb-4"
                />
                <p className="text-sm font-medium text-neutral-700">
                  Oyo State Government
                </p>
              </div>

              <div className="text-center">
                <img
                  src="/images/oyo-state-logo.svg"
                  alt="Ministry of Labour & Productivity"
                  className="h-20 lg:h-28 w-auto mx-auto mb-4"
                />
                <p className="text-sm font-medium text-neutral-700">
                  Ministry of Labour & Productivity
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Contact the Team
            </h2>

            <div className="bg-white rounded-xl border border-neutral-200 p-6 lg:p-8">
              <div className="space-y-6">
                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-primary-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 mb-1">Email</h3>
                    <a
                      href="mailto:oslsr@oyostate.gov.ng"
                      className="text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      oslsr@oyostate.gov.ng
                    </a>
                  </div>
                </div>

                {/* Address */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 mb-1">
                      Office Address
                    </h3>
                    <address className="not-italic text-neutral-600">
                      Ministry of Labour & Productivity
                      <br />
                      State Secretariat
                      <br />
                      Ibadan, Oyo State
                    </address>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AboutPageWrapper>
  );
}

export default LeadershipPage;

import { Link } from 'react-router-dom';
import { FileText, AlertTriangle, Scale, Mail } from 'lucide-react';

/**
 * TermsPage - Terms of Service page per Story 1.5.6 AC1.
 *
 * Sections:
 * - Acceptance of Terms
 * - Eligibility
 * - User Responsibilities
 * - Marketplace Rules
 * - Prohibited Activities
 * - Limitation of Liability
 * - Disclaimer of Warranties
 * - Governing Law
 * - Changes to Terms
 * - Contact Information
 */
function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-50 to-primary-100 py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-6">
              <FileText className="h-8 w-8 text-primary-600" aria-hidden="true" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Terms of Service
            </h1>
            <p className="text-lg text-neutral-600">
              Please read these terms carefully before using the Oyo State Labour & Skills Registry
            </p>
            <p className="text-sm text-neutral-500 mt-4">
              Last updated: January 2026
            </p>
          </div>
        </div>
      </section>

      {/* Terms Content */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto prose prose-neutral">
            {/* Section 1: Acceptance of Terms */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  1
                </span>
                Acceptance of Terms
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p>
                  By accessing or using the Oyo State Labour & Skills Registry (OSLSR) platform,
                  you agree to be bound by these Terms of Service and all applicable laws and regulations.
                  If you do not agree with any of these terms, you are prohibited from using this service.
                </p>
                <p>
                  These terms apply to all users, including workers registering their skills,
                  employers searching for talent, and any other visitors to the platform.
                </p>
              </div>
            </div>

            {/* Section 2: Eligibility */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  2
                </span>
                Eligibility
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p>To use OSLSR, you must:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Be at least 18 years of age</li>
                  <li>Be a resident of Oyo State, Nigeria (for worker registration)</li>
                  <li>Possess a valid National Identification Number (NIN)</li>
                  <li>Have the legal capacity to enter into binding agreements</li>
                  <li>Not be prohibited from using the service under Nigerian law</li>
                </ul>
              </div>
            </div>

            {/* Section 3: User Responsibilities */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  3
                </span>
                User Responsibilities
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p>As a user of OSLSR, you agree to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide accurate, current, and complete information during registration</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Notify us immediately of any unauthorized access to your account</li>
                  <li>Not share your account with others or allow unauthorized access</li>
                  <li>Keep your contact information up to date</li>
                  <li>Use the platform only for lawful purposes</li>
                </ul>
              </div>
            </div>

            {/* Section 4: Marketplace Rules */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  4
                </span>
                Marketplace Rules
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p className="font-medium">For Workers:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>You may opt-in to have your anonymized profile appear in the public marketplace</li>
                  <li>You control whether employers can see your contact details</li>
                  <li>You may update or remove your marketplace profile at any time</li>
                  <li>You must accurately represent your skills and experience</li>
                </ul>
                <p className="font-medium">For Employers:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You must create an account to view worker contact details</li>
                  <li>Contact information is provided solely for legitimate employment purposes</li>
                  <li>You may not use the platform for mass marketing or spam</li>
                  <li>You must respect worker privacy and consent preferences</li>
                  <li>Contact views are logged and rate-limited to prevent abuse</li>
                </ul>
              </div>
            </div>

            {/* Section 5: Prohibited Activities */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-error-100 text-error-600 rounded-full text-sm font-bold">
                  5
                </span>
                Prohibited Activities
              </h2>
              <div className="bg-error-50 border border-error-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-error-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <p className="text-error-800 text-sm">
                    Violation of these prohibitions may result in immediate account termination
                    and potential legal action.
                  </p>
                </div>
              </div>
              <div className="text-neutral-600 space-y-4">
                <p>You are prohibited from:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Providing false or misleading information</li>
                  <li>Impersonating another person or entity</li>
                  <li>Using automated tools to scrape or harvest data</li>
                  <li>Attempting to bypass security measures</li>
                  <li>Interfering with the proper functioning of the platform</li>
                  <li>Using the platform for fraudulent or illegal purposes</li>
                  <li>Collecting user contact information for unauthorized purposes</li>
                  <li>Harassing, threatening, or discriminating against other users</li>
                </ul>
              </div>
            </div>

            {/* Section 6: Limitation of Liability */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  6
                </span>
                Limitation of Liability
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p>
                  OSLSR facilitates connections between workers and employers but does not:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Guarantee employment outcomes for registered workers</li>
                  <li>Verify the quality of work performed by listed workers</li>
                  <li>Mediate disputes between workers and employers</li>
                  <li>Provide insurance or liability coverage for work arrangements</li>
                </ul>
                <p>
                  The Oyo State Government and its agencies shall not be liable for any indirect,
                  incidental, special, consequential, or punitive damages arising from your use
                  of the platform.
                </p>
              </div>
            </div>

            {/* Section 7: Disclaimer of Warranties */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  7
                </span>
                Disclaimer of Warranties
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p>
                  OSLSR is provided on an "as is" and "as available" basis. While we strive to
                  maintain high service standards, we do not warrant that:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The service will be uninterrupted or error-free</li>
                  <li>All information on the platform is accurate or complete</li>
                  <li>The platform will meet your specific requirements</li>
                  <li>Any errors or defects will be corrected immediately</li>
                </ul>
              </div>
            </div>

            {/* Section 8: Governing Law */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  8
                </span>
                Governing Law
              </h2>
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Scale className="h-5 w-5 text-neutral-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <p className="text-neutral-700 text-sm">
                    These Terms are governed by Nigerian law with exclusive jurisdiction in Oyo State courts.
                  </p>
                </div>
              </div>
              <div className="text-neutral-600 space-y-4">
                <p>
                  These Terms of Service shall be governed by and construed in accordance with
                  the laws of the Federal Republic of Nigeria. Any disputes arising from these
                  terms or your use of OSLSR shall be subject to the exclusive jurisdiction of
                  the courts located in Oyo State, Nigeria.
                </p>
                <p>
                  This platform complies with the Nigeria Data Protection Act (NDPA) and other
                  applicable data protection regulations. For more information, please review our{' '}
                  <Link to="/about/privacy" className="text-primary-600 hover:text-primary-700 underline">
                    Privacy Policy
                  </Link>.
                </p>
              </div>
            </div>

            {/* Section 9: Changes to Terms */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  9
                </span>
                Changes to Terms
              </h2>
              <div className="text-neutral-600 space-y-4">
                <p>
                  We reserve the right to modify these Terms of Service at any time.
                  When we make changes, we will:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Update the "Last updated" date at the top of this page</li>
                  <li>Notify registered users via email for significant changes</li>
                  <li>Provide a reasonable period for users to review changes before they take effect</li>
                </ul>
                <p>
                  Your continued use of OSLSR after changes are posted constitutes acceptance
                  of the modified terms.
                </p>
              </div>
            </div>

            {/* Section 10: Contact Information */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-600 rounded-full text-sm font-bold">
                  10
                </span>
                Contact Information
              </h2>
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-primary-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="text-neutral-700">
                    <p className="mb-3">
                      For questions about these Terms of Service, please contact us:
                    </p>
                    <address className="not-italic space-y-2 text-sm">
                      <p className="font-medium">Ministry of Trade, Investment, Cooperatives & Industry</p>
                      <p>Secretariat, Ibadan, Oyo State, Nigeria</p>
                      <p>
                        Email:{' '}
                        <a
                          href="mailto:legal@oslsr.oyo.gov.ng"
                          className="text-primary-600 hover:text-primary-700 underline"
                        >
                          legal@oslsr.oyo.gov.ng
                        </a>
                      </p>
                    </address>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Related Links */}
      <section className="py-12 bg-neutral-50 border-t border-neutral-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-xl font-semibold text-neutral-900 mb-6">Related Information</h2>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                to="/about/privacy"
                className="inline-flex items-center justify-center px-6 py-3 border border-neutral-300 text-neutral-700 font-medium rounded-lg hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/support/contact"
                className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default TermsPage;

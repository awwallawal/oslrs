import { Mail, Phone, Clock, MapPin, AlertTriangle, ShieldCheck, Building2, Handshake, Timer } from 'lucide-react';
import { ContactSection } from '../components';
import { AboutCallout } from '../../about/components/AboutCallout';

/**
 * Contact sections data
 */
const generalInquiries = {
  title: 'General Inquiries',
  description: 'For questions about registration, verification, or the marketplace.',
  items: [
    { icon: Mail, label: 'Email', value: 'support@oslsr.oyo.gov.ng', href: 'mailto:support@oslsr.oyo.gov.ng' },
    { icon: Phone, label: 'Phone', value: '+234 XXX XXX XXXX' },
    { icon: Clock, label: 'Hours', value: 'Monday - Friday, 8:00 AM - 5:00 PM' },
    { icon: Timer, label: 'Response time', value: 'We typically respond within 2-3 business days' },
  ],
};

const technicalSupport = {
  title: 'Technical Support',
  description: 'For website issues, login problems, or survey errors. Include screenshots if possible.',
  items: [
    { icon: Mail, label: 'Email', value: 'tech@oslsr.oyo.gov.ng', href: 'mailto:tech@oslsr.oyo.gov.ng' },
  ],
};

const dataPrivacy = {
  title: 'Data & Privacy Requests',
  description: 'For data access, correction, or deletion requests under the NDPA. Responses within 30 days.',
  items: [
    { icon: Mail, label: 'Email', value: 'dpo@oyostate.gov.ng', href: 'mailto:dpo@oyostate.gov.ng' },
    { icon: MapPin, label: 'Address', value: 'Ministry of Labour & Productivity, State Secretariat, Ibadan' },
  ],
};

const partnerships = {
  title: 'Partnerships & Media',
  description: 'For collaboration opportunities, media inquiries, or institutional partnerships.',
  items: [
    { icon: Mail, label: 'Email', value: 'partnerships@oyostate.gov.ng', href: 'mailto:partnerships@oyostate.gov.ng' },
  ],
};

/**
 * ContactPage - Contact information and support channels.
 *
 * Content from docs/public-website-ia.md Section 5.4.
 */
function ContactPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Contact Us
            </h1>
            <p className="text-lg text-neutral-600">
              Get in Touch with the OSLSR Team
            </p>
          </div>
        </div>
      </section>

      {/* Contact Sections */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ContactSection {...generalInquiries} />
              <ContactSection {...technicalSupport} />
              <ContactSection {...dataPrivacy} />
              <ContactSection {...partnerships} />
            </div>
          </div>
        </div>
      </section>

      {/* Report Abuse Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <AboutCallout variant="warning" title="Report Abuse or Fraud">
              <div className="space-y-3">
                <p>
                  If you encounter scams, fake profiles, or anyone requesting payment for OSLSR
                  registration, report it immediately.
                </p>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0" />
                  <strong className="text-warning-800">
                    OSLSR registration is completely FREE. Never pay anyone for registration.
                  </strong>
                </div>
                <p className="text-sm">
                  Report to:{' '}
                  <a
                    href="mailto:report@oslsr.oyo.gov.ng"
                    className="font-medium text-warning-700 hover:text-warning-800 underline"
                  >
                    report@oslsr.oyo.gov.ng
                  </a>
                </p>
              </div>
            </AboutCallout>
          </div>
        </div>
      </section>

      {/* Office Location Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-6 text-center">
              Office Location
            </h2>

            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-neutral-900 mb-2">
                    Ministry of Labour & Productivity
                  </h3>
                  <address className="not-italic text-neutral-600 space-y-1">
                    <p>State Secretariat</p>
                    <p>Ibadan, Oyo State</p>
                    <p>Nigeria</p>
                  </address>
                </div>
              </div>

              {/* Map Placeholder */}
              <div className="mt-6 rounded-lg bg-neutral-100 h-48 flex items-center justify-center">
                <div className="text-center text-neutral-500">
                  <MapPin className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Map coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-brand font-semibold text-neutral-900 mb-6 text-center">
              Before You Contact Us
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                href="/support/faq"
                className="flex items-center gap-3 bg-white rounded-lg border border-neutral-200 p-4 hover:border-primary-300 transition-colors"
              >
                <ShieldCheck className="w-6 h-6 text-primary-600" />
                <div>
                  <div className="font-medium text-neutral-900">Check FAQ</div>
                  <div className="text-sm text-neutral-500">Quick answers to common questions</div>
                </div>
              </a>
              <a
                href="/support/guides"
                className="flex items-center gap-3 bg-white rounded-lg border border-neutral-200 p-4 hover:border-primary-300 transition-colors"
              >
                <Handshake className="w-6 h-6 text-primary-600" />
                <div>
                  <div className="font-medium text-neutral-900">Read Guides</div>
                  <div className="text-sm text-neutral-500">Step-by-step instructions</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ContactPage;

import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { GuidePageLayout, StepList, TipCard } from '../../components';

const steps = [
  {
    title: 'Find your nearest NIMC enrollment center',
    description: 'Use the NIMC center locator to find an enrollment center near you. Centers are available in all LGAs across Oyo State.',
  },
  {
    title: 'Gather required documents',
    description: 'Bring original copies of: Birth certificate or declaration of age, proof of address (utility bill), existing ID if available (voter\'s card, driver\'s license, passport).',
  },
  {
    title: 'Visit the center during operating hours',
    description: 'NIMC centers typically operate Monday-Friday, 8:00 AM - 4:00 PM. Arrive early to avoid long queues, especially at the beginning of the week.',
  },
  {
    title: 'Complete biometric enrollment',
    description: 'You\'ll have your fingerprints captured, photo taken, and provide demographic information. The process takes about 15-30 minutes.',
  },
  {
    title: 'Receive your NIN slip',
    description: 'Upon successful enrollment, you\'ll receive a paper slip with your 11-digit NIN. Keep this safe as you\'ll need it for OSLSR registration.',
  },
];

const relatedGuides = [
  {
    href: '/support/guides/register',
    title: 'How to Register',
    description: 'Once you have your NIN, register for OSLSR.',
  },
];

/**
 * GuideGetNinPage - How to Get a NIN guide.
 *
 * Story 1.5.7 AC4
 */
function GuideGetNinPage() {
  return (
    <GuidePageLayout
      title="How to Get a NIN"
      estimatedTime="30-60 minutes at NIMC center"
      relatedGuides={relatedGuides}
    >
      <div className="space-y-8">
        {/* What is NIN Section */}
        <section className="p-6 bg-primary-50 rounded-lg border border-primary-200">
          <h2 className="text-xl font-semibold text-neutral-900 mb-3">What is a NIN?</h2>
          <p className="text-neutral-700 mb-4">
            The National Identification Number (NIN) is an 11-digit unique identifier issued by the
            National Identity Management Commission (NIMC). It serves as proof of your identity and
            is required for various government services, including OSLSR registration.
          </p>
          <p className="text-neutral-700">
            Your NIN is linked to your biometric data (fingerprints and facial image) stored in
            the National Identity Database, making it a secure and verifiable form of identification.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Step-by-Step Instructions</h2>
          <StepList steps={steps} />
        </section>

        {/* Prominent CTA */}
        <section className="mt-8">
          <div className="p-6 bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg text-white">
            <h2 className="text-xl font-semibold mb-2">Find a NIMC Enrollment Center</h2>
            <p className="text-primary-100 mb-4">
              Use the official NIMC center locator to find the nearest enrollment center in your area.
            </p>
            <a
              href="https://nimc.gov.ng/enrollment-centers/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-primary-600 font-semibold rounded-lg hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-600 transition-colors"
            >
              Find NIMC Centers
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Tips & Important Information</h2>
          <div className="space-y-4">
            <TipCard title="NIN enrollment is FREE" variant="success">
              <p>
                Getting your NIN is completely free. Do not pay anyone for NIN enrollment services.
                Report any requests for payment to NIMC or law enforcement.
              </p>
            </TipCard>
            <TipCard title="Already have a NIN?" variant="info">
              <p>
                If you've already enrolled but lost your slip, you can retrieve your NIN by visiting
                any NIMC center with your biometrics (fingerprints), or dial *346# from your registered phone.
              </p>
            </TipCard>
            <TipCard title="Required for OSLSR" variant="warning">
              <p>
                A valid NIN is mandatory for OSLSR registration. Your NIN is used to verify your
                identity and ensure the integrity of the skills registry.
              </p>
            </TipCard>
          </div>
        </section>

        {/* Quick Link to Registration */}
        <section className="mt-8 p-6 bg-neutral-50 rounded-lg border border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">Ready to Register?</h2>
          <p className="text-neutral-600 mb-4">
            Once you have your NIN, you can register for OSLSR and start building your professional profile.
          </p>
          <Link
            to="/support/guides/register"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
          >
            View Registration Guide
          </Link>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideGetNinPage;

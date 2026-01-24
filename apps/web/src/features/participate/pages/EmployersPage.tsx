import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  MapPin,
  Clock,
  Filter,
  Gift,
  Heart,
  Search,
  Eye,
  Phone,
  Handshake,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { BenefitCard } from '../../about/components/BenefitCard';
import { AboutCallout } from '../../about/components/AboutCallout';
import { FAQAccordion, VisibilityTable } from '../components';
import type { FAQItem } from '../components';

/**
 * Benefits of using the marketplace
 */
const marketplaceBenefits = [
  {
    title: 'Verified Identities',
    description: 'All workers have government-verified identities through NIN verification.',
    icon: ShieldCheck,
  },
  {
    title: 'Local Talent',
    description: 'Find skilled workers in your specific LGA or nearby areas.',
    icon: MapPin,
  },
  {
    title: 'Reduce Hiring Risk',
    description: 'Connect with verified, trustworthy workers for your business.',
    icon: Clock,
  },
  {
    title: 'Search by Skill',
    description: 'Filter by specific trades, professions, or experience levels.',
    icon: Filter,
  },
  {
    title: 'Free to Search',
    description: 'No fees to browse or contact workers in the marketplace.',
    icon: Gift,
  },
  {
    title: 'Support Local Workforce',
    description: 'Contribute to Oyo State economic development by hiring locally.',
    icon: Heart,
  },
];

/**
 * How it works steps for employers
 */
const howItWorksSteps = [
  { step: 1, title: 'Search Marketplace', description: 'Browse by skill or location', icon: Search },
  { step: 2, title: 'View Profiles', description: 'See skills and experience', icon: Eye },
  { step: 3, title: 'Request Contact', description: 'Get worker contact info', icon: Phone },
  { step: 4, title: 'Hire Directly', description: 'Connect and hire', icon: Handshake },
];

/**
 * What verification means
 */
const verificationMeans = [
  'Identity confirmed through NIN verification',
  'Worker voluntarily registered their skills',
  'Government oversight ensures data accuracy',
  'Badge indicates trustworthy identity',
];

/**
 * What verification does NOT mean
 */
const verificationDisclaimer = [
  'Does not guarantee skill proficiency',
  'Does not verify work history claims',
  'Does not replace your own due diligence',
];

/**
 * FAQ items for employers
 */
const employerFAQs: FAQItem[] = [
  {
    question: 'Is there a fee to use the marketplace?',
    answer: 'No, the marketplace is completely free to use. You can search for workers, view profiles, and request contact information at no cost.',
  },
  {
    question: 'Can I post job listings?',
    answer: 'Not currently. The marketplace is a searchable directory of verified workers. You can browse and contact workers directly, but job posting features are not available in this version.',
  },
  {
    question: "What if a worker's contact info is hidden?",
    answer: 'Some workers choose not to share their contact details publicly. If a worker has hidden their contact info, it means they have opted not to be contacted through the marketplace. Try searching for other workers with similar skills.',
  },
  {
    question: 'How do I report a fake profile?',
    answer: 'If you suspect a profile is fraudulent, use the "Report" button on the profile page or contact support at support@oslsr.oyo.gov.ng. Our team will investigate and take appropriate action.',
  },
  {
    question: 'Does the government guarantee worker quality?',
    answer: 'No. Verification confirms a worker\'s identity, not their skill level or quality of work. The government badge means their NIN was verified, not that their work is guaranteed. Always conduct your own assessment before hiring.',
  },
];

/**
 * EmployersPage - For Employers landing page.
 *
 * Content from docs/public-website-ia.md Section 4.3.
 */
function EmployersPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-success-50 to-white py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Find Verified Skilled Workers in Your Area
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 mb-8">
              Access Oyo State's official registry of verified workers. Search by skill, location, or experience.
            </p>
            <Link
              to="/marketplace"
              className="inline-block px-8 py-4 bg-success-600 text-white font-semibold rounded-lg hover:bg-success-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-success-500 focus-visible:ring-offset-2 transition-colors text-lg"
            >
              Browse Marketplace
            </Link>
          </div>
        </div>
      </section>

      {/* Why Use the Marketplace Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Why Use the OSLSR Marketplace?
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {marketplaceBenefits.map((benefit) => (
                <BenefitCard
                  key={benefit.title}
                  title={benefit.title}
                  description={benefit.description}
                  icon={benefit.icon}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-10 text-center">
              How It Works
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="text-center">
                    <div className="relative inline-flex items-center justify-center mb-4">
                      <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center">
                        <Icon className="w-7 h-7 text-success-600" />
                      </div>
                      <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success-600 text-white text-xs font-semibold flex items-center justify-center">
                        {step.step}
                      </span>
                    </div>
                    <h3 className="font-semibold text-neutral-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-neutral-600">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Understanding Verification Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Understanding Verification
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* What it means */}
              <div className="bg-success-50 rounded-xl border border-success-200 p-6">
                <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success-600" />
                  What the Badge Means
                </h3>
                <ul className="space-y-3">
                  {verificationMeans.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-neutral-700">
                      <CheckCircle2 className="w-4 h-4 text-success-600 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* What it doesn't mean */}
              <div className="bg-warning-50 rounded-xl border border-warning-200 p-6">
                <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-warning-600" />
                  What It Does NOT Mean
                </h3>
                <ul className="space-y-3">
                  {verificationDisclaimer.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-neutral-700">
                      <XCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Visibility Table Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              What Information Is Visible?
            </h2>
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <VisibilityTable />
            </div>
          </div>
        </div>
      </section>

      {/* Employer Registration Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <AboutCallout variant="info" title="Want Full Access?">
              <p className="mb-4">
                While anyone can search the marketplace, creating a free employer account gives you
                access to contact details for workers who have opted to share their information.
              </p>
              <p className="text-sm text-neutral-600">
                Registration is free and only requires basic business information. No fees, ever.
              </p>
            </AboutCallout>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <FAQAccordion items={employerFAQs} title="Frequently Asked Questions" />
          </div>
        </div>
      </section>

      {/* Search Preview Section (Phase 1 Coming Soon) */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Find Workers Now
            </h2>

            <div className="bg-neutral-100 rounded-xl p-8 text-center">
              <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto mb-4">
                <select
                  disabled
                  className="flex-1 px-4 py-3 rounded-lg border border-neutral-300 bg-white text-neutral-400 cursor-not-allowed"
                >
                  <option>Select Skill...</option>
                </select>
                <select
                  disabled
                  className="flex-1 px-4 py-3 rounded-lg border border-neutral-300 bg-white text-neutral-400 cursor-not-allowed"
                >
                  <option>Select LGA...</option>
                </select>
                <button
                  disabled
                  className="px-6 py-3 bg-neutral-300 text-neutral-500 font-medium rounded-lg cursor-not-allowed"
                >
                  Search
                </button>
              </div>
              <p className="text-sm text-neutral-500">
                Marketplace search coming soon
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-12 lg:py-16 bg-success-600">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-white mb-4">
              Ready to Find Skilled Workers?
            </h2>
            <p className="text-success-100 mb-8">
              Create a free employer account to access contact details and connect with verified workers.
            </p>
            <Link
              to="/register"
              className="inline-block px-8 py-4 bg-white text-success-600 font-semibold rounded-lg hover:bg-success-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-success-600 transition-colors"
            >
              Create Employer Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default EmployersPage;

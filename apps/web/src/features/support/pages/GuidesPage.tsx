import { Link } from 'react-router-dom';
import {
  Smartphone,
  ClipboardList,
  Eye,
  CreditCard,
  Search,
  UserPlus,
  BadgeCheck,
} from 'lucide-react';
import { GuideCard } from '../components';

/**
 * Worker guides - Updated per Story 1.5.7 AC8
 */
const workerGuides = [
  {
    title: 'How to Register',
    description: 'Step-by-step instructions for creating your OSLSR account and getting verified.',
    icon: Smartphone,
    href: '/support/guides/register',
  },
  {
    title: 'How to Complete the Survey',
    description: 'Learn what information is needed and how to fill out the skills survey.',
    icon: ClipboardList,
    href: '/support/guides/survey',
  },
  {
    title: 'How to Opt Into the Marketplace',
    description: 'Control your visibility and connect with employers in Oyo State.',
    icon: Eye,
    href: '/support/guides/marketplace-opt-in',
  },
  {
    title: 'How to Get a NIN',
    description: 'Find your nearest NIMC enrollment center and get your National ID Number.',
    icon: CreditCard,
    href: '/support/guides/get-nin',
  },
];

/**
 * Employer guides - Updated per Story 1.5.7 AC8
 */
const employerGuides = [
  {
    title: 'How to Search the Marketplace',
    description: 'Find verified skilled workers by profession, location, or experience level.',
    icon: Search,
    href: '/support/guides/search-marketplace',
  },
  {
    title: 'How to Create an Employer Account',
    description: 'Register as an employer to access contact details and connect with workers.',
    icon: UserPlus,
    href: '/support/guides/employer-account',
  },
  {
    title: 'How to Verify a Worker',
    description: 'Check if a worker is registered and verified using their verification code.',
    icon: BadgeCheck,
    href: '/support/guides/verify-worker',
  },
];

/**
 * GuidesPage - Step-by-step guides for workers and employers.
 *
 * Content from docs/public-website-ia.md Section 5.3.
 * Updated per Story 1.5.7 to link to guide detail pages.
 */
function GuidesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Guides
            </h1>
            <p className="text-lg text-neutral-600">
              Step-by-step instructions to help you use OSLSR
            </p>
          </div>
        </div>
      </section>

      {/* For Workers Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8">
              For Workers
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {workerGuides.map((guide) => (
                <GuideCard
                  key={guide.title}
                  title={guide.title}
                  description={guide.description}
                  icon={guide.icon}
                  href={guide.href}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* For Employers Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8">
              For Employers
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {employerGuides.map((guide) => (
                <GuideCard
                  key={guide.title}
                  title={guide.title}
                  description={guide.description}
                  icon={guide.icon}
                  href={guide.href}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Need More Help CTA */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-4">
              Need More Help?
            </h2>
            <p className="text-neutral-600 mb-6">
              Check our FAQ for quick answers or contact support for personalized assistance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/support/faq"
                className="inline-block px-6 py-3 bg-neutral-100 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 transition-colors"
              >
                View FAQ
              </Link>
              <Link
                to="/support/contact"
                className="inline-block px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default GuidesPage;

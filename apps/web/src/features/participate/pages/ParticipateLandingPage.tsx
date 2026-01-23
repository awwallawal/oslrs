import { Link } from 'react-router-dom';
import { User, Building2, HelpCircle, FileText, Phone } from 'lucide-react';
import { PathwayCard } from '../components';

/**
 * Helper links for "Not sure where to start?" section
 */
const helperLinks = [
  {
    icon: HelpCircle,
    title: 'Learn How It Works',
    description: 'Understand the registration process step by step',
    href: '/about/how-it-works',
  },
  {
    icon: FileText,
    title: 'Read Our Privacy Policy',
    description: 'See how we protect your personal data',
    href: '/about/privacy',
  },
  {
    icon: Phone,
    title: 'Contact Support',
    description: 'Get help from our support team',
    href: '/support',
  },
];

/**
 * ParticipateLandingPage - Choose your path (worker or employer).
 *
 * Content from docs/public-website-ia.md Section 4.1.
 */
function ParticipateLandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Join Oyo State's Official Workforce Registry
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600">
              The OSLSR connects skilled workers with employers across the state.
              Choose your path below to get started.
            </p>
          </div>
        </div>
      </section>

      {/* I Am A... Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              I Am A...
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
              {/* Worker Card */}
              <PathwayCard
                title="Skilled Worker"
                description="Register your skills and get discovered by employers looking for your expertise."
                benefits={[
                  'Get a government-verified badge',
                  'Appear in the public skills marketplace',
                  'Priority access to training programs',
                ]}
                icon={User}
                ctaText="Register My Skills"
                ctaHref="/participate/workers"
                variant="worker"
              />

              {/* Employer Card */}
              <PathwayCard
                title="Employer"
                description="Find verified skilled workers in your local area for your business needs."
                benefits={[
                  'Search verified local talent',
                  'View worker profiles and skills',
                  'Connect directly with workers',
                ]}
                icon={Building2}
                ctaText="Find Workers"
                ctaHref="/participate/employers"
                variant="employer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Not Sure Where to Start Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-6 text-center">
              Not sure where to start?
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {helperLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="flex items-start gap-3 p-4 bg-white rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-neutral-900 text-sm">
                        {link.title}
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {link.description}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ParticipateLandingPage;

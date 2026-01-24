import { Link } from 'react-router-dom';
import {
  Lightbulb,
  Settings,
  Users,
  Handshake,
  Shield,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { AboutPageWrapper } from '../components';

/**
 * Navigation cards data for the About section
 */
const navigationCards = [
  {
    title: 'The Initiative',
    description: 'Why we are building this registry and how your data helps Oyo State.',
    href: '/about/initiative',
    icon: Lightbulb,
  },
  {
    title: 'How It Works',
    description: 'Understand the simple 4-step registration process.',
    href: '/about/how-it-works',
    icon: Settings,
  },
  {
    title: 'Leadership',
    description: 'Meet the ministry leadership team behind the OSLSR.',
    href: '/about/leadership',
    icon: Users,
  },
  {
    title: 'Partners',
    description: 'Our collaborating organizations and agencies.',
    href: '/about/partners',
    icon: Handshake,
  },
  {
    title: 'Privacy & Data Protection',
    description: 'How we protect your personal information.',
    href: '/about/privacy',
    icon: Shield,
  },
];

/**
 * Timeline milestones
 */
const milestones = [
  {
    quarter: 'Q4 2025',
    title: 'Platform Launch',
    description: 'Initial platform deployment and staff onboarding',
  },
  {
    quarter: 'Q1 2026',
    title: 'Pilot Phase',
    description: 'Data collection begins in select LGAs',
  },
  {
    quarter: 'Q2 2026',
    title: 'Statewide Rollout',
    description: 'Expansion to all 33 LGAs',
  },
  {
    quarter: 'Q3 2026',
    title: 'Marketplace Launch',
    description: 'Skills marketplace opens for employers',
  },
];

/**
 * AboutLandingPage - Main landing page for the About section.
 *
 * Provides overview of OSLSR with navigation to detailed pages.
 */
function AboutLandingPage() {
  return (
    <AboutPageWrapper
      title="Understanding Oyo State's Workforce"
      subtitle="Learn about the Oyo State Labour & Skills Registry and how it benefits residents, workers, and employers across the state."
    >
      {/* Mission Statement Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-6">
              Our Mission
            </h2>
            <p className="text-lg text-neutral-600 leading-relaxed">
              The OSLSR is a government initiative to create a comprehensive,
              accurate picture of Oyo State's workforce. By collecting data directly
              from residents, we can better plan jobs programs, skills training,
              and economic development initiatives that truly serve our people.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Cards Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
            Explore
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {navigationCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.href}
                  to={card.href}
                  className="group bg-white rounded-xl border border-neutral-200 p-6 hover:border-primary-300 hover:shadow-md transition-all"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center mb-4 group-hover:bg-primary-200 transition-colors">
                    <Icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-2">
                    {card.title}
                  </h3>
                  <p className="text-sm text-neutral-600 mb-4">
                    {card.description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-primary-600 font-medium text-sm group-hover:gap-2 transition-all">
                    Learn More
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4">
                Project Timeline
              </h2>
              <p className="text-neutral-600">
                Key milestones in the OSLSR rollout
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {milestones.map((milestone, index) => (
                <div
                  key={milestone.quarter}
                  className="relative bg-white rounded-xl border border-neutral-200 p-6"
                >
                  {/* Timeline connector (hidden on mobile) */}
                  {index < milestones.length - 1 && (
                    <div className="hidden lg:block absolute top-1/2 right-0 w-6 h-0.5 bg-primary-200 translate-x-full" />
                  )}

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-primary-600" />
                    </div>
                    <span className="text-sm font-semibold text-primary-600">
                      {milestone.quarter}
                    </span>
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">
                    {milestone.title}
                  </h3>
                  <p className="text-sm text-neutral-600">
                    {milestone.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 lg:py-16 bg-primary-600">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-white mb-4">
              Ready to Register?
            </h2>
            <p className="text-primary-100 mb-8">
              Join thousands of Oyo State residents in building a comprehensive
              workforce database.
            </p>
            <Link
              to="/register"
              className="inline-block px-8 py-4 bg-white text-primary-600 font-semibold rounded-lg hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600 transition-colors"
            >
              Register Now
            </Link>
          </div>
        </div>
      </section>
    </AboutPageWrapper>
  );
}

export default AboutLandingPage;

import { Link } from 'react-router-dom';
import {
  BarChart3,
  GraduationCap,
  Briefcase,
  Building2,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { AboutPageWrapper, BenefitCard } from '../components';

/**
 * Problems being solved by OSLSR
 */
const problems = [
  'Workforce planning without accurate data leads to misallocated resources',
  'Skills training programs don\'t match actual market demands',
  'Job creation initiatives lack targeting to reach those who need them most',
  'Investors struggle to assess local talent availability',
  'Government programs can\'t measure their actual impact',
];

/**
 * Benefits of data collection
 */
const benefits = [
  {
    title: 'Policy Planning',
    description: 'Make evidence-based decisions about workforce development initiatives.',
    icon: BarChart3,
  },
  {
    title: 'Skills Training',
    description: 'Target training programs to skills gaps that actually exist in the market.',
    icon: GraduationCap,
  },
  {
    title: 'Job Creation',
    description: 'Design employment programs that match real workforce capabilities.',
    icon: Briefcase,
  },
  {
    title: 'Investment Attraction',
    description: 'Show investors the depth and breadth of local talent available.',
    icon: Building2,
  },
  {
    title: 'Program Evaluation',
    description: 'Measure the real impact of government initiatives over time.',
    icon: TrendingUp,
  },
];

/**
 * InitiativePage - Explains why OSLSR exists and how data helps.
 *
 * Content from docs/public-website-ia.md Section 3.2.
 */
function InitiativePage() {
  return (
    <AboutPageWrapper
      title="The Initiative"
      subtitle="Understanding why we're building the Oyo State Labour & Skills Registry"
    >
      {/* The Problem Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-6">
              The Problem We're Solving
            </h2>
            <p className="text-lg text-neutral-600 mb-8">
              For too long, Oyo State has made important workforce decisions without
              accurate, up-to-date information about who our workers are, what skills
              they have, and where they're located.
            </p>

            <ul className="space-y-4">
              {problems.map((problem, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-warning-100 flex items-center justify-center text-warning-600 text-sm font-semibold">
                    !
                  </span>
                  <span className="text-neutral-700">{problem}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How Your Data Helps Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4">
                How Your Data Helps
              </h2>
              <p className="text-neutral-600 max-w-2xl mx-auto">
                When you register your skills and work information, you help
                government make better decisions in these key areas:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((benefit) => (
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

      {/* A Living Registry Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 hidden sm:block">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-primary-600" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4">
                  A Living Registry
                </h2>
                <p className="text-lg text-neutral-600 mb-4">
                  The OSLSR isn't a one-time census. It's a continuously updated
                  database that grows and evolves as Oyo State's workforce changes.
                </p>
                <p className="text-neutral-600 mb-4">
                  You can update your profile at any time as you gain new skills,
                  change jobs, or want to adjust your marketplace visibility. This
                  means the data we use to make decisions is always current.
                </p>
                <p className="text-neutral-600">
                  By participating, you become part of a powerful tool for
                  positive change in Oyo State — and you may also connect with
                  employers looking for your exact skills through our upcoming
                  marketplace.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 lg:py-16 bg-primary-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4">
              Ready to Contribute?
            </h2>
            <p className="text-neutral-600 mb-8">
              Your skills matter. Register today and help shape Oyo State's future
              workforce planning.
            </p>
            <Link
              to="/register"
              className="inline-block px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors"
            >
              Register Now
            </Link>
          </div>
        </div>
      </section>
    </AboutPageWrapper>
  );
}

export default InitiativePage;

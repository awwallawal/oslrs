import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { GuidePageLayout, StepList, TipCard } from '../../components';

const steps = [
  {
    title: 'Click "Register" or "Create Employer Account"',
    description: 'From the OSLSR homepage or marketplace, click the Register button and select "Employer" as your account type.',
  },
  {
    title: 'Enter business information',
    description: 'Provide your business name, registration number (if applicable), industry category, and business address.',
  },
  {
    title: 'Verify your email',
    description: 'Check your inbox for a verification link. Click the link to confirm your email address and activate your account.',
  },
  {
    title: 'Complete your business profile',
    description: 'Add additional information about your business including contact details, description, and any relevant certifications.',
  },
  {
    title: 'Start searching workers',
    description: 'Once verified, you can browse the marketplace, view worker profiles, and request access to contact information.',
  },
];

const benefits = [
  'Access to verified worker contact details',
  'Advanced search and filter options',
  'Save favorite worker profiles',
  'Track contact history and communications',
  'Priority support from the OSLSR team',
];

const relatedGuides = [
  {
    href: '/support/guides/search-marketplace',
    title: 'How to Search the Marketplace',
    description: 'Learn how to find the right workers for your needs.',
  },
  {
    href: '/support/guides/verify-worker',
    title: 'How to Verify a Worker',
    description: 'Confirm worker registration before hiring.',
  },
];

/**
 * GuideEmployerAccountPage - Setting Up an Employer Account guide.
 *
 * Story 1.5.7 AC6
 */
function GuideEmployerAccountPage() {
  return (
    <GuidePageLayout
      title="Setting Up an Employer Account"
      estimatedTime="2 minutes"
      relatedGuides={relatedGuides}
    >
      <div className="space-y-8">
        {/* Why Register Section */}
        <section className="p-6 bg-primary-50 rounded-lg border border-primary-200">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Why Create an Employer Account?</h2>
          <p className="text-neutral-700 mb-4">
            An employer account gives you full access to the OSLSR marketplace, allowing you to connect
            with verified skilled workers across Oyo State. Here's what you get:
          </p>
          <ul className="space-y-2">
            {benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-2 text-neutral-700">
                <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Step-by-Step Instructions</h2>
          <StepList steps={steps} />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Important Information</h2>
          <div className="space-y-4">
            <TipCard title="Registration is FREE" variant="success">
              <p>
                Creating an employer account is completely free. There are no subscription fees
                or hidden charges to access the marketplace.
              </p>
            </TipCard>
            <TipCard title="Contact views are logged" variant="info">
              <p>
                When you view a worker's contact details, this is logged for accountability and
                to protect worker privacy. Please use contact information responsibly.
              </p>
            </TipCard>
            <TipCard title="Business verification" variant="info">
              <p>
                While not required for basic access, verified businesses with CAC registration
                may receive additional badges and priority in worker searches.
              </p>
            </TipCard>
          </div>
        </section>

        {/* CTA to Register */}
        <section className="mt-8 p-6 bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg text-white">
          <h2 className="text-xl font-semibold mb-2">Ready to Get Started?</h2>
          <p className="text-primary-100 mb-4">
            Create your employer account in minutes and start finding skilled workers today.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center px-6 py-3 bg-white text-primary-600 font-semibold rounded-lg hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-600 transition-colors"
          >
            Create Employer Account
          </Link>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideEmployerAccountPage;

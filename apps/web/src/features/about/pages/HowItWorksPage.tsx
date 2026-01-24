import { Link } from 'react-router-dom';
import {
  UserPlus,
  Mail,
  ClipboardList,
  BadgeCheck,
  CreditCard,
  Phone,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { AboutPageWrapper, AboutCallout } from '../components';

/**
 * Registration steps data
 */
const steps = [
  {
    step: 1,
    title: 'Create Account',
    description: 'Start by entering your phone number, email address, and NIN (National Identification Number).',
    icon: UserPlus,
    details: [
      'Provide a valid Nigerian mobile number',
      'Enter your 11-digit NIN for identity verification',
      'Create a secure password',
    ],
  },
  {
    step: 2,
    title: 'Verify Email',
    description: 'Check your email inbox and click the verification link we send you.',
    icon: Mail,
    details: [
      'Check your inbox (and spam folder)',
      'Click the verification link',
      'Link expires in 24 hours',
    ],
  },
  {
    step: 3,
    title: 'Complete Survey',
    description: 'Fill out a short questionnaire about your skills, work experience, and employment status.',
    icon: ClipboardList,
    details: [
      'Takes approximately 10 minutes',
      'Answer questions about your occupation',
      'List your skills and experience',
      'Choose marketplace visibility options',
    ],
  },
  {
    step: 4,
    title: 'Get Verified',
    description: 'Once verified, you\'ll receive a digital ID card and can appear in the skills marketplace.',
    icon: BadgeCheck,
    details: [
      'Verification typically takes 24-48 hours',
      'Receive your digital worker ID',
      'Appear in public marketplace (if opted in)',
      'Access your dashboard anytime',
    ],
  },
];

/**
 * Requirements checklist
 */
const requirements = [
  {
    icon: CreditCard,
    title: 'NIN (National Identification Number)',
    description: 'Your 11-digit NIN verifies your identity',
  },
  {
    icon: Phone,
    title: 'Phone Number',
    description: 'A Nigerian mobile number for verification',
  },
  {
    icon: Mail,
    title: 'Email Address',
    description: 'For account verification and updates',
  },
  {
    icon: Clock,
    title: 'About 10 Minutes',
    description: 'Time needed to complete the survey',
  },
];

/**
 * HowItWorksPage - Explains the 4-step registration process.
 *
 * Content from docs/public-website-ia.md Section 3.3.
 */
function HowItWorksPage() {
  return (
    <AboutPageWrapper
      title="How It Works"
      subtitle="Register your skills in 4 simple steps"
    >
      {/* Steps Overview */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-10 text-center">
              Registration in 4 Simple Steps
            </h2>

            {/* Steps Visual Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="relative">
                    {/* Connector Arrow (desktop only) */}
                    {index < steps.length - 1 && (
                      <div className="hidden lg:block absolute top-12 right-0 w-6 text-primary-300 translate-x-1/2 z-10">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                        </svg>
                      </div>
                    )}

                    <div className="text-center">
                      {/* Step Number */}
                      <div className="relative inline-flex items-center justify-center mb-4">
                        <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center">
                          <Icon className="w-10 h-10 text-primary-600" />
                        </div>
                        <span className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-primary-600 text-white font-semibold flex items-center justify-center text-sm">
                          {step.step}
                        </span>
                      </div>

                      <h3 className="font-semibold text-neutral-900 mb-2">
                        {step.title}
                      </h3>
                      <p className="text-sm text-neutral-600">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detailed Step Breakdowns */}
            <div className="space-y-8">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.step}
                    className="bg-neutral-50 rounded-xl p-6 lg:p-8"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                          <Icon className="w-6 h-6 text-primary-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                          Step {step.step}: {step.title}
                        </h3>
                        <p className="text-neutral-600 mb-4">{step.description}</p>
                        <ul className="space-y-2">
                          {step.details.map((detail, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <BadgeCheck className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-neutral-700">{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* What You'll Need Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              What You'll Need
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              {requirements.map((req) => {
                const Icon = req.icon;
                return (
                  <div
                    key={req.title}
                    className="flex gap-4 bg-white p-6 rounded-xl border border-neutral-200"
                  >
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-primary-600" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">
                        {req.title}
                      </h3>
                      <p className="text-sm text-neutral-600">{req.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* NIN Info Callout */}
            <AboutCallout variant="info" title="Don't have a NIN?">
              <p className="mb-3">
                The National Identification Number (NIN) is required for identity
                verification. If you don't have one yet, you can get enrolled at
                any NIMC enrollment center.
              </p>
              <a
                href="https://nimc.gov.ng/enrollment-centers/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors"
              >
                Find a NIMC enrollment center near you
                <ExternalLink className="w-4 h-4" />
              </a>
            </AboutCallout>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 lg:py-16 bg-primary-600">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-white mb-4">
              Ready to Start?
            </h2>
            <p className="text-primary-100 mb-8">
              The registration process takes about 10 minutes. Have your NIN ready
              and let's get started.
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

export default HowItWorksPage;

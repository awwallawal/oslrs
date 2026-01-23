import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Search,
  GraduationCap,
  Wrench,
  Scissors,
  Car,
  Monitor,
  Wheat,
  Briefcase,
  UserPlus,
  Mail,
  ClipboardList,
  Shield,
  Lock,
  Eye,
  Database,
  CreditCard,
  Phone,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { BenefitCard } from '../../about/components/BenefitCard';
import { AboutCallout } from '../../about/components/AboutCallout';
import { WorkerCategoryCard, FAQAccordion } from '../components';
import type { FAQItem } from '../components';

/**
 * Benefits of registering
 */
const benefits = [
  {
    title: 'Government Verified Badge',
    description: 'Stand out with official verification that proves your identity to employers.',
    icon: BadgeCheck,
  },
  {
    title: 'Appear in Marketplace',
    description: 'Get discovered by employers searching for your specific skills.',
    icon: Search,
  },
  {
    title: 'Priority Access',
    description: 'Get early access to government training programs and job opportunities.',
    icon: GraduationCap,
  },
];

/**
 * Worker categories
 */
const workerCategories = [
  {
    title: 'Artisans & Tradespeople',
    examples: ['Electricians', 'Plumbers', 'Carpenters', 'Mechanics', 'Welders', 'Painters', 'Bricklayers'],
    icon: Wrench,
  },
  {
    title: 'Skilled Professionals',
    examples: ['Tailors', 'Hairdressers', 'Barbers', 'Caterers', 'Event Planners', 'Photographers'],
    icon: Scissors,
  },
  {
    title: 'Service Workers',
    examples: ['Drivers', 'Security Guards', 'Cleaners', 'Domestic Workers', 'Delivery Personnel'],
    icon: Car,
  },
  {
    title: 'Technical & Digital',
    examples: ['Software Developers', 'IT Support', 'Graphic Designers', 'Social Media Managers'],
    icon: Monitor,
  },
  {
    title: 'Agricultural Workers',
    examples: ['Farmers', 'Farm Hands', 'Agro-processors', 'Livestock Handlers'],
    icon: Wheat,
  },
  {
    title: 'Job Seekers',
    examples: ['Currently unemployed but actively looking for work'],
    icon: Briefcase,
  },
];

/**
 * Registration steps
 */
const registrationSteps = [
  { step: 1, title: 'Create Account', description: 'Register with phone, email, and NIN', icon: UserPlus },
  { step: 2, title: 'Verify Email', description: 'Confirm your email address', icon: Mail },
  { step: 3, title: 'Complete Survey', description: 'Tell us about your skills (~10 min)', icon: ClipboardList },
  { step: 4, title: 'Get Verified', description: 'Receive your verified badge', icon: BadgeCheck },
];

/**
 * Requirements checklist
 */
const requirements = [
  { icon: CreditCard, title: 'NIN', description: 'Your 11-digit National Identification Number' },
  { icon: Phone, title: 'Phone Number', description: 'A Nigerian mobile number' },
  { icon: Mail, title: 'Email Address', description: 'For verification and updates' },
  { icon: Clock, title: '~10 Minutes', description: 'Time to complete the survey' },
];

/**
 * Privacy assurances
 */
const privacyAssurances = [
  { icon: Shield, title: 'NDPA Compliant', description: 'We follow Nigeria Data Protection Act guidelines' },
  { icon: Lock, title: 'Data Encrypted', description: 'Your information is securely encrypted' },
  { icon: Eye, title: 'You Control Visibility', description: 'Choose what appears in the marketplace' },
  { icon: Database, title: 'No Data Selling', description: 'We never sell your personal information' },
];

/**
 * FAQ items for workers
 */
const workerFAQs: FAQItem[] = [
  {
    question: 'Is registration free?',
    answer: 'Yes, registration is completely free. There are no fees to register your skills or appear in the marketplace.',
  },
  {
    question: 'Do I need to upload a photo?',
    answer: 'No, photos are not required for registration. You can complete your profile without uploading any images.',
  },
  {
    question: "What if I don't want to appear in the marketplace?",
    answer: "That's your choice. You can register your skills for workforce planning purposes without appearing in the public marketplace. Your data still helps government planning.",
  },
  {
    question: 'Can I update my information later?',
    answer: 'Yes, you can update your profile information at any time before verification. After verification, you can request changes through support.',
  },
  {
    question: 'How long does verification take?',
    answer: 'Most verifications are completed within 7 days. You will receive an email notification once your profile is verified.',
  },
];

/**
 * WorkersPage - For Workers landing page.
 *
 * Content from docs/public-website-ia.md Section 4.2.
 */
function WorkersPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Get Discovered by Employers Across Oyo State
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 mb-8">
              Register your skills, get verified, and connect with employers looking for your expertise.
            </p>
            <Link
              to="/register"
              className="inline-block px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors text-lg"
            >
              Register Now
            </Link>
          </div>
        </div>
      </section>

      {/* Why Register Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Why Register?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {benefits.map((benefit) => (
                <BenefitCard
                  key={benefit.title}
                  title={benefit.title}
                  description={benefit.description}
                  icon={benefit.icon}
                />
              ))}
            </div>

            <AboutCallout variant="success" title="What the Verified Badge Means">
              <p>
                When you complete registration and verification, you receive a government-verified badge
                that appears on your marketplace profile. This badge tells employers that your identity
                has been confirmed through NIN verification, making you a more trustworthy candidate.
              </p>
            </AboutCallout>
          </div>
        </div>
      </section>

      {/* Who Should Register Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Who Should Register?
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {workerCategories.map((category) => (
                <WorkerCategoryCard
                  key={category.title}
                  title={category.title}
                  examples={category.examples}
                  icon={category.icon}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How Registration Works Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-10 text-center">
              How Registration Works
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {registrationSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="text-center">
                    <div className="relative inline-flex items-center justify-center mb-4">
                      <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                        <Icon className="w-7 h-7 text-primary-600" />
                      </div>
                      <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-semibold flex items-center justify-center">
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

      {/* What You'll Need Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              What You'll Need
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {requirements.map((req) => {
                const Icon = req.icon;
                return (
                  <div key={req.title} className="bg-white rounded-lg border border-neutral-200 p-4 text-center">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center mx-auto mb-3">
                      <Icon className="w-5 h-5 text-primary-600" />
                    </div>
                    <h3 className="font-semibold text-neutral-900 text-sm mb-1">{req.title}</h3>
                    <p className="text-xs text-neutral-600">{req.description}</p>
                  </div>
                );
              })}
            </div>

            <AboutCallout variant="info" title="Don't have a NIN?">
              <p className="mb-3">
                The National Identification Number (NIN) is required for identity verification.
                If you don't have one, you can enroll at any NIMC center.
              </p>
              <a
                href="https://nimc.gov.ng/enrollment-centers/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors"
              >
                Find a NIMC enrollment center
                <ExternalLink className="w-4 h-4" />
              </a>
            </AboutCallout>
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Your Privacy Is Protected
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {privacyAssurances.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="bg-success-50 rounded-lg border border-success-200 p-4 text-center">
                    <div className="w-10 h-10 rounded-lg bg-success-100 flex items-center justify-center mx-auto mb-3">
                      <Icon className="w-5 h-5 text-success-600" />
                    </div>
                    <h3 className="font-semibold text-neutral-900 text-sm mb-1">{item.title}</h3>
                    <p className="text-xs text-neutral-600">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <FAQAccordion items={workerFAQs} title="Frequently Asked Questions" />
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-12 lg:py-16 bg-primary-600">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-primary-100 mb-8">
              Join thousands of Oyo State workers who have already registered their skills.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="inline-block px-8 py-4 bg-white text-primary-600 font-semibold rounded-lg hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-600 transition-colors"
              >
                Register Now
              </Link>
              <Link
                to="/login"
                className="inline-block px-8 py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-600 transition-colors"
              >
                Continue your registration →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default WorkersPage;

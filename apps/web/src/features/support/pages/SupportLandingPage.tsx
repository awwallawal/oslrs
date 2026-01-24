import { Link } from 'react-router-dom';
import { HelpCircle, BookOpen, MessageSquare, UserCheck, ArrowRight } from 'lucide-react';
import { SupportCard, SearchBox } from '../components';
import { FAQAccordion } from '../../participate/components';
import type { FAQItem } from '../../participate/components';

/**
 * Quick link cards for Support landing page
 */
const quickLinks = [
  {
    title: 'FAQ',
    description: 'Find answers to the most common questions about registration, verification, and more.',
    icon: HelpCircle,
    href: '/support/faq',
  },
  {
    title: 'Guides',
    description: 'Step-by-step instructions for workers and employers.',
    icon: BookOpen,
    href: '/support/guides',
  },
  {
    title: 'Contact Us',
    description: 'Get in touch with our support team for personalized help.',
    icon: MessageSquare,
    href: '/support/contact',
  },
];

/**
 * Popular FAQ items shown on landing page (per AC1)
 */
const popularFAQs: FAQItem[] = [
  {
    question: 'How do I register for OSLSR?',
    answer: 'Visit the registration page and create an account with your email, phone number, and NIN. You will receive a verification email to confirm your account. Once verified, complete the skills survey to finalize your registration.',
  },
  {
    question: 'What is the NIN and where do I get one?',
    answer: 'The NIN (National Identification Number) is an 11-digit number issued by NIMC (National Identity Management Commission). You can enroll at any NIMC enrollment center. Visit nimc.gov.ng/enrollment-centers to find the nearest center.',
  },
  {
    question: 'Is registration free?',
    answer: 'Yes, registration is completely free. OSLSR never charges fees for registration, verification, or marketplace access. Report any request for payment as fraud to report@oslsr.oyo.gov.ng.',
  },
  {
    question: 'How long does verification take?',
    answer: 'Most verifications are completed within 7 days. You will receive an email notification once your profile is verified. Complex cases may take longer.',
  },
  {
    question: 'Can I update my information after registering?',
    answer: 'Yes, you can update your profile information at any time before verification. After verification, you can request changes through support by contacting support@oslsr.oyo.gov.ng.',
  },
];

/**
 * SupportLandingPage - Main support hub with quick links and popular FAQs.
 *
 * Content from docs/public-website-ia.md Section 5.1.
 */
function SupportLandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              How Can We Help?
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 mb-8">
              Find answers to common questions, read step-by-step guides, or contact our support team.
            </p>
            <SearchBox placeholder="Search for help..." className="max-w-xl mx-auto" />
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Quick Links
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {quickLinks.map((link) => (
                <SupportCard
                  key={link.href}
                  title={link.title}
                  description={link.description}
                  icon={link.icon}
                  href={link.href}
                />
              ))}
            </div>

            {/* Verify Worker - Full Width */}
            <SupportCard
              title="Verify a Worker"
              description="Check if a worker is registered and verified in the OSLSR system using their verification code."
              icon={UserCheck}
              href="/support/verify-worker"
              fullWidth
            />
          </div>
        </div>
      </section>

      {/* Popular Questions Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Popular Questions
            </h2>

            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <FAQAccordion items={popularFAQs} />
            </div>

            <div className="mt-6 text-center">
              <Link
                to="/support/faq"
                className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors"
              >
                See all FAQs
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Still Need Help CTA */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-4">
              Still Need Help?
            </h2>
            <p className="text-neutral-600 mb-6">
              Our support team is here to assist you with any questions or issues.
            </p>
            <Link
              to="/support/contact"
              className="inline-block px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default SupportLandingPage;

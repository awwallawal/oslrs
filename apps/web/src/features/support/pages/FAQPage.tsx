import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SearchBox, CategoryTabs } from '../components';
import { FAQAccordion } from '../../participate/components';
import type { FAQItem } from '../../participate/components';

/**
 * FAQ categories
 */
const categories = ['All', 'Registration', 'Survey', 'Verification', 'Marketplace', 'Privacy', 'Technical'];

/**
 * FAQ items organized by category
 */
const faqsByCategory: Record<string, FAQItem[]> = {
  Registration: [
    {
      question: 'How do I register for OSLSR?',
      answer: 'Visit the registration page and create an account with your email, phone number, and NIN. You will receive a verification email to confirm your account. Once verified, complete the skills survey to finalize your registration.',
    },
    {
      question: 'Is registration free?',
      answer: 'Yes, registration is completely free. OSLSR never charges fees for registration, verification, or marketplace access. Report any request for payment as fraud to report@oslsr.oyo.gov.ng.',
    },
    {
      question: 'What is the NIN and where do I get one?',
      answer: 'The NIN (National Identification Number) is an 11-digit number issued by NIMC (National Identity Management Commission). You can enroll at any NIMC enrollment center. Visit nimc.gov.ng/enrollment-centers to find the nearest center.',
    },
    {
      question: 'Do I need to upload a photo?',
      answer: 'No, photos are not required for registration. You can complete your profile without uploading any images. A photo may be requested later if you opt into the skills marketplace.',
    },
    {
      question: 'Can I register if I am currently unemployed?',
      answer: 'Yes, you can register even if you are currently unemployed. The OSLSR is designed for all Oyo State residents looking for work, including job seekers. Registering helps connect you with potential employers.',
    },
  ],
  Survey: [
    {
      question: 'How long does the survey take?',
      answer: 'The skills survey typically takes 10-15 minutes to complete. The exact time depends on your work history and the number of skills you want to register.',
    },
    {
      question: 'Can I save and continue later?',
      answer: 'Yes, your progress is automatically saved. You can log back in and continue where you left off at any time.',
    },
    {
      question: 'What information does the survey ask for?',
      answer: 'The survey asks about your skills, work experience, education level, location (LGA), and employment preferences. All information is used to help match you with relevant opportunities.',
    },
  ],
  Verification: [
    {
      question: 'How long does verification take?',
      answer: 'Most verifications are completed within 7 days. You will receive an email notification once your profile is verified. Complex cases may take longer.',
    },
    {
      question: 'What does "Government Verified" mean?',
      answer: 'The "Government Verified" badge means your identity has been confirmed through NIN verification by the Oyo State government. It confirms who you are, not your skill level or work quality. Employers should still conduct their own assessments.',
    },
    {
      question: 'Will I get an ID card?',
      answer: 'Once verified, you can download a digital ID card from your profile. This card contains your verification code that employers can use to confirm your registration status.',
    },
  ],
  Marketplace: [
    {
      question: 'What is the Skills Marketplace?',
      answer: 'The Skills Marketplace is a public directory where employers can search for verified workers by skill, location, or experience. It helps connect workers with job opportunities across Oyo State.',
    },
    {
      question: 'Do I have to appear in the marketplace?',
      answer: 'No, marketplace visibility is optional. You can register your skills for government workforce planning without appearing in the public marketplace. You can change this setting at any time in your profile.',
    },
    {
      question: 'What information is visible to employers?',
      answer: 'Public search shows your profession, LGA, experience level, and verification badge. Your name, phone number, and bio are only visible to registered employers, and only if you opt to share contact details.',
    },
  ],
  Privacy: [
    {
      question: 'Is my NIN stored publicly?',
      answer: 'No, your NIN is never displayed publicly. It is only used for identity verification and is stored securely. Only the verification status (verified/not verified) is shown on your profile.',
    },
    {
      question: 'Can I delete my data?',
      answer: 'Yes, you can request data deletion by contacting the Data Protection Officer at dpo@oyostate.gov.ng. Under the Nigeria Data Protection Act (NDPA), we are required to respond within 30 days.',
    },
    {
      question: 'Who can see my data?',
      answer: 'Your data is only accessible to authorized government staff for workforce planning purposes, and to employers (limited information) if you opt into the marketplace. We follow strict NDPA guidelines for data protection.',
    },
  ],
  Technical: [
    {
      question: "I didn't receive the verification email. What should I do?",
      answer: 'First, check your spam/junk folder. If the email is not there, visit the resend verification page to request a new email. If problems persist, contact tech@oslsr.oyo.gov.ng with your registered email address.',
    },
    {
      question: 'I forgot my password. How do I reset it?',
      answer: 'Click "Forgot Password" on the login page and enter your registered email address. You will receive a password reset link. If you do not receive the email, check your spam folder or contact support.',
    },
    {
      question: "The survey isn't loading. What should I do?",
      answer: 'Try refreshing the page or clearing your browser cache. Make sure you have a stable internet connection. If the issue persists, try a different browser or contact tech@oslsr.oyo.gov.ng with details about the error.',
    },
  ],
};

/**
 * FAQPage - Comprehensive FAQ page with category filtering.
 *
 * Content from docs/public-website-ia.md Section 5.2.
 */
function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('All');

  // Filter categories to show based on active selection
  const visibleCategories = activeCategory === 'All'
    ? Object.keys(faqsByCategory)
    : [activeCategory];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-neutral-600 mb-8">
              Find answers to common questions about OSLSR registration, verification, and more.
            </p>
            <SearchBox placeholder="Search FAQs..." className="max-w-xl mx-auto" />
          </div>
        </div>
      </section>

      {/* Category Tabs & FAQ Content */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Category Tabs */}
            <CategoryTabs
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />

            {/* FAQ Sections */}
            <div className="space-y-8">
              {visibleCategories.map((category) => (
                <div
                  key={category}
                  id={`faq-panel-${category.toLowerCase()}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${category.toLowerCase()}`}
                >
                  <h2 className="text-xl font-semibold text-neutral-900 mb-4">{category}</h2>
                  <div className="bg-white rounded-xl border border-neutral-200 p-6">
                    <FAQAccordion items={faqsByCategory[category]} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Can't Find Answer CTA */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-4">
              Can't Find Your Answer?
            </h2>
            <p className="text-neutral-600 mb-6">
              Our support team is ready to help you with any questions not covered here.
            </p>
            <Link
              to="/support/contact"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors"
            >
              Contact Support
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default FAQPage;

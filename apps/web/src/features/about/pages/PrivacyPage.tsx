import {
  CheckCircle2,
  XCircle,
  Shield,
  Lock,
  Eye,
  FileText,
  Users,
  Mail,
} from 'lucide-react';
import { AboutPageWrapper, AboutCallout } from '../components';

/**
 * TL;DR summary points
 */
const tldrPoints = [
  'We only collect data necessary for workforce planning',
  'Your NIN is verified locally and not stored publicly',
  'You control your marketplace visibility',
  'We never sell or share your data with third parties',
  'All data is encrypted and securely stored',
  'You can request your data or deletion at any time',
  'We comply with the Nigeria Data Protection Act (NDPA)',
];

/**
 * Data collection categories
 */
const dataCategories = [
  {
    title: 'Personal Information',
    items: [
      'Full name',
      'National Identification Number (NIN)',
      'Phone number',
      'Email address',
      'Date of birth',
      'Gender',
      'Local Government Area (LGA)',
    ],
  },
  {
    title: 'Work & Skills Information',
    items: [
      'Employment status',
      'Occupation/Trade',
      'Skills and certifications',
      'Years of experience',
      'Work history',
    ],
  },
  {
    title: 'Optional Marketplace Information',
    items: [
      'Professional bio',
      'Portfolio/work samples link',
      'Availability status',
      'Contact preferences',
    ],
  },
];

/**
 * How data is used
 */
const dataUses = [
  'Workforce planning and policy development',
  'Skills gap analysis and training program design',
  'Economic development initiatives',
  'Connecting workers with employers (if you opt in)',
  'Generating anonymized statistics for public reports',
];

/**
 * What we don't do
 */
const neverStatements = [
  'Sell your personal data to any third party',
  'Share your NIN or contact details publicly without consent',
  'Use your data for political purposes',
  'Allow unauthorized access to personal information',
  'Retain data longer than necessary',
];

/**
 * Data protection measures
 */
const protectionMeasures = [
  {
    icon: Lock,
    title: 'Encryption',
    description: 'All data is encrypted in transit and at rest using industry-standard protocols.',
  },
  {
    icon: Users,
    title: 'Access Control',
    description: 'Only authorized staff can access personal data, with full audit logging.',
  },
  {
    icon: Shield,
    title: 'Security Testing',
    description: 'Regular security assessments and penetration testing.',
  },
  {
    icon: FileText,
    title: 'Audit Logging',
    description: 'All data access is logged for accountability and compliance.',
  },
];

/**
 * NDPA rights
 */
const ndpaRights = [
  {
    icon: Eye,
    title: 'Right to Access',
    description: 'Request a copy of all data we hold about you.',
  },
  {
    icon: FileText,
    title: 'Right to Rectification',
    description: 'Request correction of inaccurate personal data.',
  },
  {
    icon: XCircle,
    title: 'Right to Erasure',
    description: 'Request deletion of your personal data.',
  },
  {
    icon: Lock,
    title: 'Right to Restriction',
    description: 'Request limitation of data processing.',
  },
  {
    icon: Users,
    title: 'Right to Object',
    description: 'Object to certain types of data processing.',
  },
];

/**
 * PrivacyPage - Privacy policy and data protection information.
 *
 * Content from docs/public-website-ia.md Section 3.6.
 */
function PrivacyPage() {
  return (
    <AboutPageWrapper
      title="Privacy & Data Protection"
      subtitle="How we collect, use, and protect your personal information"
    >
      {/* TL;DR Summary */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <AboutCallout variant="highlight" title="TL;DR - The Quick Version">
              <ul className="space-y-2">
                {tldrPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </AboutCallout>

            <p className="text-sm text-neutral-500 mt-4 text-center">
              Last Updated: January 2026
            </p>
          </div>
        </div>
      </section>

      {/* What Data We Collect */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              What Data We Collect
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dataCategories.map((category) => (
                <div
                  key={category.title}
                  className="bg-white rounded-xl border border-neutral-200 p-6"
                >
                  <h3 className="font-semibold text-neutral-900 mb-4">
                    {category.title}
                  </h3>
                  <ul className="space-y-2">
                    {category.items.map((item, index) => (
                      <li
                        key={index}
                        className="text-sm text-neutral-600 flex items-start gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-2" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How We Use Your Data */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              How We Use Your Data
            </h2>

            <div className="bg-white rounded-xl border border-neutral-200 p-6 lg:p-8">
              <ul className="space-y-4">
                {dataUses.map((use, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                    <span className="text-neutral-700">{use}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* What We Don't Do */}
      <section className="py-12 lg:py-16 bg-error-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              What We Don't Do
            </h2>

            <div className="bg-white rounded-xl border-2 border-error-200 p-6 lg:p-8">
              <p className="text-neutral-700 mb-6 font-medium">
                We will NEVER:
              </p>
              <ul className="space-y-4">
                {neverStatements.map((statement, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
                    <span className="text-neutral-700">{statement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Data Protection Measures */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              Data Protection Measures
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {protectionMeasures.map((measure) => {
                const Icon = measure.icon;
                return (
                  <div
                    key={measure.title}
                    className="flex gap-4 bg-white rounded-xl border border-neutral-200 p-6"
                  >
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-primary-600" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">
                        {measure.title}
                      </h3>
                      <p className="text-sm text-neutral-600">
                        {measure.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Your Rights Under NDPA */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4 text-center">
              Your Rights Under NDPA
            </h2>
            <p className="text-neutral-600 text-center mb-8 max-w-2xl mx-auto">
              The Nigeria Data Protection Act (NDPA) gives you specific rights
              regarding your personal data:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {ndpaRights.map((right) => {
                const Icon = right.icon;
                return (
                  <div
                    key={right.title}
                    className="bg-white rounded-xl border border-neutral-200 p-6 text-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6 text-primary-600" />
                    </div>
                    <h3 className="font-semibold text-neutral-900 mb-2">
                      {right.title}
                    </h3>
                    <p className="text-sm text-neutral-600">{right.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Data Retention */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-6 text-center">
              Data Retention
            </h2>

            <div className="bg-white rounded-xl border border-neutral-200 p-6 lg:p-8">
              <p className="text-neutral-700 mb-4">
                We retain your personal data only as long as necessary to fulfill
                the purposes outlined in this policy, or as required by law.
              </p>
              <ul className="space-y-3 text-neutral-600">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-2" />
                  <span>
                    <strong>Active accounts:</strong> Data is retained while your
                    account remains active.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-2" />
                  <span>
                    <strong>Deleted accounts:</strong> Personal data is deleted
                    within 30 days of account deletion request.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-2" />
                  <span>
                    <strong>Anonymized data:</strong> Aggregated, anonymized data
                    may be retained indefinitely for statistical purposes.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Contact DPO */}
      <section className="py-12 lg:py-16 bg-primary-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-4">
              Contact the Data Protection Officer
            </h2>
            <p className="text-neutral-600 mb-8">
              If you have questions about this privacy policy or wish to exercise
              your data protection rights, please contact our Data Protection
              Officer:
            </p>

            <div className="inline-flex flex-col sm:flex-row items-center gap-4">
              <a
                href="mailto:dpo@oyostate.gov.ng"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                <Mail className="w-5 h-5" />
                Contact DPO
              </a>
              <span className="text-neutral-600 text-sm">
                dpo@oyostate.gov.ng
              </span>
            </div>
          </div>
        </div>
      </section>
    </AboutPageWrapper>
  );
}

export default PrivacyPage;

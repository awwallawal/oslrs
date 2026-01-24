import { GuidePageLayout, StepList, TipCard } from '../../components';
import { Eye, EyeOff, Lock } from 'lucide-react';

const prerequisites = [
  { text: 'Completed OSLSR registration' },
  { text: 'Completed skills survey' },
];

const steps = [
  {
    title: 'Log in to your account',
    description: 'Visit the OSLSR website and sign in with your credentials. You\'ll need to access your profile settings.',
  },
  {
    title: 'Go to Privacy Settings',
    description: 'Navigate to your account settings and find the "Privacy" or "Marketplace Settings" section.',
  },
  {
    title: 'Review marketplace consent options',
    description: 'Read the information about what opting into the marketplace means. Understand what employers will be able to see.',
  },
  {
    title: 'Choose your visibility level',
    description: 'Select how much of your profile you want visible. Options include showing skills only, skills with location, or full profile details.',
  },
  {
    title: 'Confirm your choices',
    description: 'Review your selections and click "Save" or "Confirm". You can change these settings at any time.',
  },
];

const relatedGuides = [
  {
    href: '/support/guides/survey',
    title: 'How to Complete the Survey',
    description: 'Complete your survey before opting into the marketplace.',
  },
];

/**
 * GuideMarketplaceOptInPage - How to Opt Into the Marketplace guide.
 *
 * Story 1.5.7 AC3
 */
function GuideMarketplaceOptInPage() {
  return (
    <GuidePageLayout
      title="How to Opt Into the Marketplace"
      estimatedTime="2 minutes"
      prerequisites={prerequisites}
      relatedGuides={relatedGuides}
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Step-by-Step Instructions</h2>
          <StepList steps={steps} />
        </section>

        {/* What Employers Can See Section */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">What Employers Can See</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-5 h-5 text-success-600" />
                <h3 className="font-semibold text-neutral-900">Always Visible</h3>
              </div>
              <ul className="text-sm text-neutral-600 space-y-1">
                <li>Skills and expertise</li>
                <li>Experience level</li>
                <li>Verification badge</li>
              </ul>
            </div>
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-2 mb-3">
                <EyeOff className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-neutral-900">Your Choice</h3>
              </div>
              <ul className="text-sm text-neutral-600 space-y-1">
                <li>LGA/Location</li>
                <li>Availability status</li>
                <li>Profile photo</li>
              </ul>
            </div>
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-5 h-5 text-error-600" />
                <h3 className="font-semibold text-neutral-900">Protected</h3>
              </div>
              <ul className="text-sm text-neutral-600 space-y-1">
                <li>Full name</li>
                <li>Phone/Email</li>
                <li>NIN details</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Important Information</h2>
          <div className="space-y-4">
            <TipCard title="Your data is protected" variant="success">
              <p>
                Your personal contact information (name, phone, email) is never shown publicly.
                Employers must have a verified account and request access to contact you.
              </p>
            </TipCard>
            <TipCard title="You can opt out anytime" variant="info">
              <p>
                You can change your marketplace visibility settings at any time. Opting out will
                immediately remove your profile from search results.
              </p>
            </TipCard>
          </div>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideMarketplaceOptInPage;

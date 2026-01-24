import { GuidePageLayout, StepList, TipCard } from '../../components';

const prerequisites = [
  { text: 'Completed OSLSR registration' },
  { text: 'Device with internet connection' },
  { text: 'About 10-15 minutes of uninterrupted time' },
];

const steps = [
  {
    title: 'Log in to your account',
    description: 'Visit the OSLSR website and log in using your email/phone and password. Make sure you\'re using the account you created during registration.',
  },
  {
    title: 'Navigate to the survey section',
    description: 'From your dashboard, click on "Complete Survey" or find the survey link in the onboarding checklist. The survey is required to complete your profile.',
  },
  {
    title: 'Complete personal information',
    description: 'Enter your personal details including address, date of birth, and other demographic information. This helps match you with relevant opportunities.',
  },
  {
    title: 'Enter your skills and experience',
    description: 'List your primary skills, trade categories, and years of experience. Be specific about your expertise levels and any certifications you hold.',
  },
  {
    title: 'Answer employment history questions',
    description: 'Provide information about your current and past work experience. Include details about employers, job roles, and duration of employment.',
  },
  {
    title: 'Save and submit',
    description: 'Review your responses carefully, then submit the survey. You can save your progress and return later if needed.',
  },
];

const relatedGuides = [
  {
    href: '/support/guides/register',
    title: 'How to Register',
    description: 'Haven\'t registered yet? Start with the registration guide.',
  },
  {
    href: '/support/guides/marketplace-opt-in',
    title: 'How to Opt Into the Marketplace',
    description: 'After completing the survey, make your profile visible to employers.',
  },
];

/**
 * GuideSurveyPage - How to Complete the Survey guide for workers.
 *
 * Story 1.5.7 AC2
 */
function GuideSurveyPage() {
  return (
    <GuidePageLayout
      title="How to Complete the Survey"
      estimatedTime="10-15 minutes"
      prerequisites={prerequisites}
      relatedGuides={relatedGuides}
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Step-by-Step Instructions</h2>
          <StepList steps={steps} />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Tips for Success</h2>
          <div className="space-y-4">
            <TipCard title="Save your progress" variant="info">
              <p>
                You don't have to complete the survey in one sitting. Your progress is automatically saved,
                and you can return to continue where you left off.
              </p>
            </TipCard>
            <TipCard title="Offline mode available" variant="info">
              <p>
                If you have an unstable internet connection, the survey supports offline mode. Your responses
                will sync automatically when you reconnect.
              </p>
            </TipCard>
            <TipCard title="Be accurate and honest" variant="warning">
              <p>
                Provide truthful information about your skills and experience. Misrepresentation may result
                in removal from the registry and affect your verification status.
              </p>
            </TipCard>
          </div>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideSurveyPage;

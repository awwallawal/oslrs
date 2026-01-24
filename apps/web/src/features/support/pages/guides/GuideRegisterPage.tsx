import { GuidePageLayout, StepList, TipCard } from '../../components';

const prerequisites = [
  { text: 'National Identification Number (NIN)' },
  { text: 'Valid email address or phone number' },
  { text: 'Recent photograph (selfie will be captured during registration)' },
];

const steps = [
  {
    title: 'Visit the registration page',
    description: 'Go to the OSLSR website and click the "Register" button in the top navigation. You can also visit /register directly.',
  },
  {
    title: 'Enter your NIN',
    description: 'Input your 11-digit National Identification Number. This will be verified against the NIMC database to confirm your identity.',
  },
  {
    title: 'Verify your identity',
    description: 'Take a live selfie using your device camera. This photo will be compared with your NIN records for identity verification.',
  },
  {
    title: 'Create account credentials',
    description: 'Set up your email/phone and create a secure password. Your password must be at least 8 characters with uppercase, lowercase, and numbers.',
  },
  {
    title: 'Verify your email/phone',
    description: 'Check your inbox for a verification link or enter the OTP code sent to your phone. This confirms you own the contact method provided.',
  },
  {
    title: 'Complete your profile',
    description: 'Add your skills, work experience, and other relevant information. The more complete your profile, the better your chances of being found by employers.',
  },
];

const relatedGuides = [
  {
    href: '/support/guides/survey',
    title: 'How to Complete the Survey',
    description: 'Learn how to fill out the skills survey after registration.',
  },
  {
    href: '/support/guides/marketplace-opt-in',
    title: 'How to Opt Into the Marketplace',
    description: 'Make your profile visible to employers in Oyo State.',
  },
];

/**
 * GuideRegisterPage - How to Register guide for workers.
 *
 * Story 1.5.7 AC1
 */
function GuideRegisterPage() {
  return (
    <GuidePageLayout
      title="How to Register"
      estimatedTime="5-10 minutes"
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
            <TipCard title="Prepare your NIN" variant="info">
              <p>
                Make sure you have your NIN ready before starting. If you don't have one yet,
                visit our <a href="/support/guides/get-nin" className="text-primary-600 hover:underline">How to Get a NIN</a> guide.
              </p>
            </TipCard>
            <TipCard title="Good lighting for selfie" variant="info">
              <p>
                Find a well-lit area for the selfie verification step. Avoid backlighting and ensure your face is clearly visible.
              </p>
            </TipCard>
            <TipCard title="Registration is FREE" variant="success">
              <p>
                OSLSR registration is completely free. Never pay anyone for registration services. Report any requests for payment to <a href="mailto:report@oslsr.oyo.gov.ng" className="text-primary-600 hover:underline">report@oslsr.oyo.gov.ng</a>.
              </p>
            </TipCard>
          </div>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideRegisterPage;

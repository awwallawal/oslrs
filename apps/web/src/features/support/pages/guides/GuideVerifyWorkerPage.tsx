import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Shield } from 'lucide-react';
import { GuidePageLayout, StepList, TipCard } from '../../components';
import { siteEmail } from '../../../../config/site';
import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
} from '../../../../lib/trust-claims';

const steps = [
  {
    title: 'Obtain the worker\'s verification code',
    description: 'Ask the worker for their OSLSR verification code. The code format is OSLSR-XXXX-XXXX (e.g., OSLSR-ABCD-1234).',
  },
  {
    title: 'Go to the Verify Worker page',
    description: 'Navigate to the verification tool at /support/verify-worker or click the "Verify Worker" link in the Support menu.',
  },
  {
    title: 'Enter the verification code',
    description: 'Type or paste the worker\'s verification code into the input field. The code is not case-sensitive.',
  },
  {
    title: 'View verification results',
    description: 'Click "Verify" to check the worker\'s registration status. Results appear immediately.',
  },
  {
    title: 'Understand what results mean',
    // [AI-Review][High] 2026-09-09 — was "their NIN has been validated". It is
    // format-checked, never validated against any registry.
    description: 'A verified status confirms the worker is registered in OSLSR and that a State Assessor approved the registration. This does not confirm their identity, and does not guarantee skill level or work quality.',
  },
];

const relatedGuides = [
  {
    href: '/support/guides/search-marketplace',
    title: 'How to Search the Marketplace',
    // [AI-Review][High] 2026-09-09 — "verified workers" is the same blanket claim
    // removed from the marketplace strapline (H1); the grid is about to carry
    // association-vouched cards that no one verified.
    description: 'Find skilled workers through the marketplace.',
  },
  {
    href: '/support/guides/employer-account',
    title: 'Setting Up an Employer Account',
    description: 'Create an account to contact workers.',
  },
];

/**
 * GuideVerifyWorkerPage - How to Verify a Worker guide.
 *
 * Story 1.5.7 AC7
 */
function GuideVerifyWorkerPage() {
  return (
    <GuidePageLayout
      title="How to Verify a Worker"
      estimatedTime="1 minute"
      relatedGuides={relatedGuides}
    >
      <div className="space-y-8">
        {/* What Verification Confirms Section */}
        <section className="p-6 bg-neutral-50 rounded-lg border border-neutral-200">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary-600" />
            What Verification Confirms
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold text-success-700 flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5" />
                What It DOES Confirm
              </h3>
              {/*
                ⚠️ [AI-Review][High] 2026-09-09 (Story 13-58) — this list read
                "NIN has been validated" and "Identity verified by government"
                under a green tick. Both are false: NIN validation is FORMAT-ONLY
                and there is no NIMC path. Now rendered from the canonical source.
              */}
              <ul className="space-y-1 text-sm text-neutral-700">
                {GOVERNMENT_VERIFICATION_MEANS.map((claim) => (
                  <li key={claim}>{claim}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-error-700 flex items-center gap-2 mb-2">
                <XCircle className="w-5 h-5" />
                What It Does NOT Confirm
              </h3>
              <ul className="space-y-1 text-sm text-neutral-700">
                {GOVERNMENT_VERIFICATION_DOES_NOT_MEAN.map((claim) => (
                  <li key={claim}>{claim}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Step-by-Step Instructions</h2>
          <StepList steps={steps} />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Understanding Verification Results</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-success-50 rounded-lg border border-success-200">
              <CheckCircle className="w-6 h-6 text-success-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-success-800">Verified</h3>
                {/*
                  [AI-Review][High] 2026-09-09 — was "their identity has been
                  confirmed through NIN verification". No such check exists.
                */}
                <p className="text-sm text-success-700">
                  The worker is registered in OSLSR and a State Assessor reviewed and approved their registration.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-error-50 rounded-lg border border-error-200">
              <XCircle className="w-6 h-6 text-error-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-error-800">Not Found</h3>
                <p className="text-sm text-error-700">
                  The code is invalid or the worker is not registered. Double-check the code with the worker.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Important Reminders</h2>
          <div className="space-y-4">
            <TipCard title="Verification is just one step" variant="warning">
              <p>
                Always conduct your own interview and assessment of workers before hiring.
                Verification confirms an approved registration — not identity, skill level,
                or work quality.
              </p>
            </TipCard>
            <TipCard title="Report suspicious activity" variant="info">
              <p>
                If a worker claims to be verified but their code doesn't check out, or if you
                encounter fraud, report it to <a href={`mailto:${siteEmail('report')}`} className="text-primary-600 hover:underline">{siteEmail('report')}</a>.
              </p>
            </TipCard>
          </div>
        </section>

        {/* CTA to Verification Tool */}
        <section className="mt-8 p-6 bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg text-white">
          <h2 className="text-xl font-semibold mb-2">Ready to Verify?</h2>
          <p className="text-primary-100 mb-4">
            Use our verification tool to check a worker's registration status instantly.
          </p>
          <Link
            to="/support/verify-worker"
            className="inline-flex items-center px-6 py-3 bg-white text-primary-600 font-semibold rounded-lg hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600 transition-colors"
          >
            Go to Verification Tool
          </Link>
        </section>
      </div>
    </GuidePageLayout>
  );
}

export default GuideVerifyWorkerPage;

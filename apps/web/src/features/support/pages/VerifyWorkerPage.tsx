import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, HelpCircle, MessageSquare } from 'lucide-react';
import { VerificationCodeInput } from '../components';
import { AboutCallout } from '../../about/components/AboutCallout';
import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
} from '../../../lib/trust-claims';

/**
 * ⚠️ [AI-Review][High] 2026-09-09 (Story 13-58) — these two lists were LOCAL and
 * two of their three "confirms" entries were FALSE:
 *
 *   'NIN (National Identification Number) has been validated'   ← format-only
 *   "Worker's identity has been confirmed by the government"    ← no NIMC path
 *
 * That is the exact claim `GovernmentVerifiedBadge` was corrected away from on
 * 2026-08-18; this page and the how-to guide kept saying it for another three
 * weeks, on a PUBLIC page, under a green tick reading "What It DOES Confirm".
 * Both now render the canonical lists so a correction can never again land on one
 * surface and miss two.
 */
const verificationConfirms = GOVERNMENT_VERIFICATION_MEANS;
const verificationDoesNotConfirm = GOVERNMENT_VERIFICATION_DOES_NOT_MEAN;

/**
 * VerifyWorkerPage - Verification code lookup and explanation.
 *
 * Content from docs/public-website-ia.md Section 5.5.
 */
function VerifyWorkerPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              Verify a Worker
            </h1>
            <p className="text-lg text-neutral-600">
              Check whether a worker is registered in the OSLSR system, and whether their
              registration was approved, using their verification code.
            </p>
          </div>
        </div>
      </section>

      {/* Verification Lookup Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl border border-neutral-200 p-6 lg:p-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-6">
                Verification Lookup
              </h2>
              <VerificationCodeInput />
            </div>
          </div>
        </div>
      </section>

      {/* What Does Verification Mean Section */}
      <section className="py-12 lg:py-16 bg-neutral-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-8 text-center">
              What Does Verification Mean?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* What it confirms */}
              <div className="bg-success-50 rounded-xl border border-success-200 p-6">
                <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success-600" />
                  What Verification Confirms
                </h3>
                <ul className="space-y-3">
                  {verificationConfirms.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-neutral-700">
                      <CheckCircle2 className="w-4 h-4 text-success-600 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* What it does NOT confirm */}
              <div className="bg-warning-50 rounded-xl border border-warning-200 p-6">
                <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-warning-600" />
                  What It Does NOT Confirm
                </h3>
                <ul className="space-y-3">
                  {verificationDoesNotConfirm.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-neutral-700">
                      <XCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8">
              <AboutCallout variant="info" title="Important Reminder">
                <p>
                  Always interview and assess workers before hiring. The verification badge confirms
                  that a State Assessor approved this registration — not the worker&apos;s identity,
                  skill level, or work quality. Your own due diligence is essential when making
                  hiring decisions.
                </p>
              </AboutCallout>
            </div>
          </div>
        </div>
      </section>

      {/* Need Help Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl lg:text-2xl font-brand font-semibold text-neutral-900 mb-4">
              Need Help?
            </h2>
            <p className="text-neutral-600 mb-6">
              Having trouble with verification or have questions about what it means?
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/support/faq"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-100 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
                View FAQ
              </Link>
              <Link
                to="/support/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors"
              >
                <MessageSquare className="w-5 h-5" />
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default VerifyWorkerPage;

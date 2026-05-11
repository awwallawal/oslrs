import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  WizardStepIndicator,
  type WizardStep,
} from '../features/registration/components/WizardStepIndicator';
import { TrustBadgesRow } from '../features/registration/components/TrustBadgesRow';

/**
 * Story 9-12 Task 4.1 — Wizard layout.
 *
 * Renders sticky chrome around an arbitrary step content slot:
 *   - Top: "Back to Homepage" link + Oyo State coat-of-arms + sticky
 *          WizardStepIndicator (AC#2)
 *   - Centre: caller-supplied content (`children`)
 *   - Bottom: sticky TrustBadgesRow (AC#8)
 *
 * The layout is shape-agnostic — step components own their internal layout
 * and validation. The wizard's URL routing (`/register?step=N`) and form
 * state live in the parent page, NOT in this layout.
 */

export interface WizardLayoutProps {
  steps: WizardStep[];
  currentStepIndex: number;
  onStepClick?: (idx: number) => void;
  children: ReactNode;
  /** Slot rendered above trust badges (e.g. autosave-status indicator). */
  footerSlot?: ReactNode;
}

export function WizardLayout({
  steps,
  currentStepIndex,
  onStepClick,
  children,
  footerSlot,
}: WizardLayoutProps) {
  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Registration Error',
        description: 'Unable to load the registration wizard. Please try again.',
      }}
    >
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        {/* Back to Homepage link */}
        <div className="p-4 sm:p-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-primary-600 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md px-2 py-1 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Homepage
          </Link>
        </div>

        {/* Logo */}
        <div className="flex justify-center pb-4 sm:pb-6">
          <Link
            to="/"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg p-2"
            aria-label="OSLSR Home"
          >
            <img
              src="/images/oyo-coat-of-arms.png"
              alt="Oyo State Labour & Skills Registry"
              className="h-[60px] w-auto"
            />
          </Link>
        </div>

        {/* Sticky step indicator */}
        <div
          className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur"
          data-testid="wizard-layout-step-indicator"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
            <WizardStepIndicator
              steps={steps}
              currentStepIndex={currentStepIndex}
              onStepClick={onStepClick}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-xl">
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
              {children}
            </div>
            {footerSlot && <div className="mt-3">{footerSlot}</div>}
          </div>
        </div>

        {/* Trust badges footer */}
        <footer className="border-t border-neutral-200 bg-white px-4 py-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <TrustBadgesRow />
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

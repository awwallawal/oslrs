import { useMemo } from 'react';
import { cn } from '../../../lib/utils';
import { suggestCorrectedEmail } from '../lib/email-typo-dictionary';

/**
 * Story 9-12 AC#5 — Email typo detection (Sally's Form Pattern).
 *
 * Pure presentational component: parent passes the current email value (typed
 * once user blurs out of the field) and an `onAccept` handler. If the domain
 * matches a known typo, renders an Info-700 suggestion line with a "[Use this]"
 * button. Never auto-corrects.
 *
 * Wire on blur (NOT on every keystroke) to avoid surfacing partial typos like
 * "user@gma" while the user is still typing.
 *
 * Accessibility: suggestion is announced via `role="status"
 * aria-live="polite"` so screen readers pick it up without interrupting form
 * navigation.
 */

export interface EmailTypoDetectionProps {
  email: string;
  /**
   * Called when the user clicks "Use this" — the parent applies the corrected
   * email to its form state.
   */
  onAccept: (correctedEmail: string) => void;
  className?: string;
}

export function EmailTypoDetection({
  email,
  onAccept,
  className,
}: EmailTypoDetectionProps) {
  const suggestion = useMemo(() => suggestCorrectedEmail(email), [email]);
  if (!suggestion) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="email-typo-suggestion"
      className={cn('mt-1 flex flex-wrap items-baseline gap-1 text-sm text-info-700', className)}
    >
      <span>
        Did you mean{' '}
        <span className="font-medium font-mono">{suggestion}</span>?
      </span>
      <button
        type="button"
        onClick={() => onAccept(suggestion)}
        className="font-medium text-info-700 hover:text-info-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-info-500 focus-visible:ring-offset-2 rounded"
        data-testid="email-typo-accept"
      >
        Use this
      </button>
    </div>
  );
}

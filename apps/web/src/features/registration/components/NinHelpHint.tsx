import { useId, useState, useRef, useEffect } from 'react';
import { HelpCircle, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Story 9-12 AC#3 — `NinHelpHint` shared component (Sally's Form Pattern).
 *
 * Three render variants:
 *   - `inline`  — under the NIN input. Used by the public wizard Step 5
 *                 State C view and by the enumerator FormFillerPage inline
 *                 NIN question (Task 13).
 *   - `tooltip` — icon button beside the label. Used by the Data Entry Clerk
 *                 paper-form layout where vertical real estate is tight.
 *   - `banner`  — full-width above the NIN field. Used by the pending-NIN
 *                 return-to-complete view (AC#9 / CompleteNinPage).
 *
 * The `*346#` USSD reminder copy is rendered in JetBrains Mono (`font-mono`)
 * on a soft-tinted background so it visually separates from the surrounding
 * body text and reads as a literal phone instruction.
 *
 * Accessibility:
 *   - inline  → caller wires the NIN input's `aria-describedby` to `id`.
 *   - tooltip → toggle button is keyboard-focusable; surface is `role="note"`.
 *   - banner  → outer is `role="note"` + `aria-label="National Identification
 *               Number help"` so screen readers announce intent.
 */

export interface NinHelpHintProps {
  /** Render variant. */
  variant?: 'inline' | 'tooltip' | 'banner';
  /** DOM id to receive `aria-describedby` from the NIN input. Auto-generated if absent. */
  id?: string;
  /** Optional override for the help copy (leave undefined for default). */
  message?: string;
  /**
   * Inline variant only — called when the user clicks "I don't have my NIN
   * now". The parent wizard sets `pendingNinToggle=true` and clears the
   * questionnaire NIN response (per Step 5 dispatcher Dev Notes).
   */
  onPendingNinClick?: () => void;
  /** Hide the inline "I don't have my NIN now" link (e.g. on State C where the toggle lives below). */
  hidePendingLink?: boolean;
  /** Extra className applied to the outermost element. */
  className?: string;
}

const DEFAULT_MESSAGE =
  "Don't have your NIN on you? Dial *346# from any phone registered with NIMC to retrieve it instantly.";

export function NinHelpHint({
  variant = 'inline',
  id,
  message = DEFAULT_MESSAGE,
  onPendingNinClick,
  hidePendingLink = false,
  className,
}: NinHelpHintProps) {
  const autoId = useId();
  const hintId = id ?? `nin-help-hint-${autoId}`;

  if (variant === 'tooltip') {
    return <TooltipVariant hintId={hintId} message={message} className={className} />;
  }

  if (variant === 'banner') {
    return (
      <aside
        role="note"
        aria-label="National Identification Number help"
        id={hintId}
        className={cn(
          'flex items-start gap-3 rounded-lg border border-info-200 bg-info-50 p-4 text-info-700',
          className,
        )}
        data-testid="nin-help-hint-banner"
      >
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-info-600" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-sm">
            {message.split(/(\*346#)/).map((segment, idx) =>
              segment === '*346#' ? (
                <span
                  key={idx}
                  className="rounded bg-info-100 px-1.5 py-0.5 font-mono text-info-800"
                  data-testid="nin-help-hint-ussd"
                >
                  *346#
                </span>
              ) : (
                segment
              ),
            )}
          </p>
        </div>
      </aside>
    );
  }

  // inline variant
  return (
    <div
      id={hintId}
      role="note"
      aria-label="National Identification Number help"
      className={cn('mt-2 space-y-1 text-sm text-neutral-600', className)}
      data-testid="nin-help-hint-inline"
    >
      <p>
        {message.split(/(\*346#)/).map((segment, idx) =>
          segment === '*346#' ? (
            <span
              key={idx}
              className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-800"
              data-testid="nin-help-hint-ussd"
            >
              *346#
            </span>
          ) : (
            segment
          ),
        )}
      </p>
      {!hidePendingLink && onPendingNinClick && (
        <button
          type="button"
          onClick={onPendingNinClick}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded"
          data-testid="nin-help-hint-pending-link"
        >
          I don't have my NIN now
        </button>
      )}
    </div>
  );
}

function TooltipVariant({
  hintId,
  message,
  className,
}: {
  hintId: string;
  message: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click — keeps the surface non-modal & keyboard friendly.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={cn('relative inline-block', className)} ref={popoverRef}>
      <button
        type="button"
        aria-label="NIN help"
        aria-expanded={open}
        aria-controls={hintId}
        onClick={() => setOpen((s) => !s)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        data-testid="nin-help-hint-tooltip-toggle"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={hintId}
          role="note"
          aria-label="National Identification Number help"
          className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700 shadow-md"
          data-testid="nin-help-hint-tooltip-content"
        >
          <p>
            {message.split(/(\*346#)/).map((segment, idx) =>
              segment === '*346#' ? (
                <span
                  key={idx}
                  className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-800"
                  data-testid="nin-help-hint-ussd"
                >
                  *346#
                </span>
              ) : (
                segment
              ),
            )}
          </p>
        </div>
      )}
    </div>
  );
}

import { useId } from 'react';
import { cn } from '../../../lib/utils';

/**
 * Story 9-12 AC#4 — Pending-NIN toggle (Sally's Form Pattern).
 *
 * Rendered on Step 5 State C (when the form has no NIN question — the
 * wizard owns NIN). When ON:
 *   - Parent disables the NIN input but RETAINS any previously entered value
 *     (so flipping the toggle back OFF restores the typed digits).
 *   - Submit button label flips "Submit Registration" → "Save as Pending".
 *   - A consequence-preview card (Info-50 bg / Info-600 left border) appears
 *     beneath the toggle: "Your registration will be saved as pending. We'll
 *     email you to complete it. We'll also remind you in 2 days, 7 days, and
 *     14 days."
 *
 * Implemented as a styled `<button role="switch">` per WAI-ARIA Switch
 * pattern. Keyboard: Space/Enter toggles. Screen reader: announces "switch,
 * pressed/not pressed". State survives back-navigation (the parent owns the
 * source of truth in `wizard_drafts.formData.pendingNinToggle`).
 */

export interface PendingNinToggleProps {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  /** Optional label override (default: "I don't have my NIN with me right now"). */
  label?: string;
  /** Show/hide the consequence-preview card. Defaults to true when `pressed`. */
  showConsequence?: boolean;
  /** Auto-disable while a parent submit is in-flight. */
  disabled?: boolean;
  className?: string;
}

const CONSEQUENCE_COPY =
  "Your registration will be saved as pending. We'll email you to complete it. We'll also remind you in 2 days, 7 days, and 14 days.";

export function PendingNinToggle({
  pressed,
  onChange,
  label = "I don't have my NIN with me right now",
  showConsequence,
  disabled = false,
  className,
}: PendingNinToggleProps) {
  const id = useId();
  const consequenceVisible = showConsequence ?? pressed;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={pressed}
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          onClick={() => onChange(!pressed)}
          data-testid="pending-nin-toggle"
          className={cn(
            'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50',
            pressed ? 'bg-primary-600' : 'bg-neutral-300',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
              pressed ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
        <label
          id={`${id}-label`}
          htmlFor={undefined}
          className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
        >
          {label}
        </label>
      </div>

      {consequenceVisible && (
        <div
          role="status"
          aria-live="polite"
          data-testid="pending-nin-consequence"
          className="rounded-md border-l-4 border-info-600 bg-info-50 p-3 text-sm text-info-800"
        >
          {CONSEQUENCE_COPY}
        </div>
      )}
    </div>
  );
}

import { useId, useRef, useState, useEffect } from 'react';

/**
 * Story 9-12 Task 13 — pending-NIN confirm prompt for enumerator + clerk
 * surfaces (FormFillerPage, ClerkDataEntryPage).
 *
 * Triggered by the NinHelpHint inline "I don't have my NIN now" link. Renders
 * an inline confirmation panel under the NIN question with an OPTIONAL reason
 * text input ("respondent forgot NIN card", "respondent unsure of number",
 * etc.). On Confirm: parent stamps `_pendingNin: true` + `_deferReasonNin`
 * into the submission rawData and advances past the NIN question.
 *
 * The reason field is OPTIONAL by design (per Universal Pending-NIN D5):
 * required reasons collect fake answers ("dunno"). Optional + audited
 * provides signal without friction; anti-abuse logic uses the unfilled rate
 * as a flag (per Universal Pending-NIN D6).
 *
 * Public wizard does NOT use this prompt — the wizard's inline toggle auto-
 * sets reason to `public_wizard_user_self_deferred` per D5.
 */

const MAX_REASON_LENGTH = 500;

export interface PendingNinPromptProps {
  open: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export function PendingNinPrompt({ open, onConfirm, onCancel }: PendingNinPromptProps) {
  const headingId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset reason whenever the prompt opens fresh.
  useEffect(() => {
    if (open) {
      setReason('');
      // Defer focus so the panel is in the DOM.
      const t = window.setTimeout(() => reasonRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className="mt-3 rounded-lg border border-info-200 bg-info-50 p-4"
      data-testid="pending-nin-prompt"
    >
      <h3 id={headingId} className="text-sm font-semibold text-info-900">
        Save as pending without a NIN?
      </h3>
      <p className="mt-1 text-sm text-info-800">
        The respondent's submission will be saved as pending. You'll be able to
        add the NIN later — or another field officer who captures the NIN will
        complete the record automatically.
      </p>

      <div className="mt-3">
        <label htmlFor={reasonId} className="block text-xs font-medium text-info-900">
          Reason (optional)
        </label>
        <textarea
          id={reasonId}
          ref={reasonRef}
          rows={2}
          maxLength={MAX_REASON_LENGTH}
          placeholder="e.g. respondent forgot NIN card, NIN not yet issued"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 block w-full rounded-md border border-info-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-info-500 focus:outline-none focus:ring-1 focus:ring-info-500"
          data-testid="pending-nin-prompt-reason"
        />
        <p className="mt-1 text-[11px] text-info-700">
          {reason.length}/{MAX_REASON_LENGTH}
        </p>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-md border border-info-200 bg-white px-3 py-2 text-sm font-medium text-info-800 hover:bg-info-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-info-500 focus-visible:ring-offset-2"
          data-testid="pending-nin-prompt-cancel"
        >
          Never mind
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason.trim() ? reason.trim() : undefined)}
          className="inline-flex items-center justify-center rounded-md bg-info-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-info-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-info-500 focus-visible:ring-offset-2"
          data-testid="pending-nin-prompt-confirm"
        >
          Save as pending
        </button>
      </div>
    </div>
  );
}

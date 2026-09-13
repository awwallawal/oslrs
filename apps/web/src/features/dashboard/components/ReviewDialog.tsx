/**
 * ReviewDialog Component
 * Story 4.4 AC4.4.5: AlertDialog for reviewing a fraud detection.
 * Resolution radio/select with all 6 options, optional notes textarea.
 */

import { useState } from 'react';
import { fraudSubjectLabel } from '../api/fraud.api';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';

const RESOLUTION_OPTIONS = [
  { value: 'false_positive', label: 'Verified \u2014 False Positive', description: 'Detection is not fraudulent' },
  { value: 'confirmed_fraud', label: 'Confirmed Fraud', description: 'Detection confirmed as fraudulent activity' },
  { value: 'needs_investigation', label: 'Needs Investigation', description: 'Requires further review' },
  { value: 'dismissed', label: 'Dismissed', description: 'Not actionable at this time' },
  { value: 'enumerator_warned', label: 'Enumerator Warned', description: 'Warning issued to enumerator' },
  { value: 'enumerator_suspended', label: 'Enumerator Suspended', description: 'Enumerator account suspended' },
] as const;

interface ReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (resolution: string, resolutionNotes?: string) => void;
  isPending: boolean;
  /**
   * 13-2 R-A2 — null for an imported detection. Callers pass the value straight
   * from the API, so the dialog does the labelling rather than trusting each
   * caller to remember.
   */
  enumeratorName: string | null;
  importBatchId?: string | null;
}

/**
 * 13-2 R-A2 review — resolutions that ACT ON AN ENUMERATOR. An imported detection has
 * no enumerator (its accountable party is an import batch), so offering "warn" or
 * "suspend" would record an action against nobody and read, in the audit trail, as
 * if one had been taken.
 */
const ENUMERATOR_ACTIONS: ReadonlySet<string> = new Set(['enumerator_warned', 'enumerator_suspended']);

export function ReviewDialog({ isOpen, onClose, onSubmit, isPending, enumeratorName, importBatchId }: ReviewDialogProps) {
  const [resolution, setResolution] = useState<string>('');
  const [notes, setNotes] = useState('');
  const options = importBatchId
    ? RESOLUTION_OPTIONS.filter((o) => !ENUMERATOR_ACTIONS.has(o.value))
    : RESOLUTION_OPTIONS;

  const handleSubmit = () => {
    if (resolution) {
      onSubmit(resolution, notes.trim() || undefined);
    }
  };

  const handleClose = () => {
    setResolution('');
    setNotes('');
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Review Fraud Detection</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Select a resolution for the detection flagged on{' '}
                <strong>{fraudSubjectLabel({ enumeratorName, importBatchId })}</strong>.
              </p>

              {/* Resolution Options */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-neutral-700 mb-2">Resolution</legend>
                {options.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      resolution === option.value
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value={option.value}
                      checked={resolution === option.value}
                      onChange={(e) => setResolution(e.target.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-neutral-900">{option.label}</span>
                      <p className="text-xs text-neutral-500">{option.description}</p>
                    </div>
                  </label>
                ))}
              </fieldset>

              {/* Notes */}
              <div>
                <label htmlFor="resolution-notes" className="block text-sm font-medium text-neutral-700 mb-1">
                  Notes <span className="text-neutral-400">(optional)</span>
                </label>
                <textarea
                  id="resolution-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                  placeholder="Add any notes about this review..."
                  rows={3}
                  maxLength={1000}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent resize-none"
                />
                <p className="text-xs text-neutral-400 mt-1">{notes.length}/1000</p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={handleClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isPending || !resolution}
            className="bg-neutral-900 hover:bg-neutral-800"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Review'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { Loader2 } from 'lucide-react';

interface BulkVerificationModalProps {
  isOpen: boolean;
  alertCount: number;
  onVerify: (context: string) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

/**
 * BulkVerificationModal — AlertDialog for bulk event verification.
 * Story 4.5 AC4.5.3: mandatory justification textarea with character counter.
 */
export function BulkVerificationModal({
  isOpen,
  alertCount,
  onVerify,
  onCancel,
  isPending,
}: BulkVerificationModalProps) {
  const [context, setContext] = useState('');

  const isValid = context.length >= MIN_LENGTH && context.length <= MAX_LENGTH;

  function handleClose() {
    if (isPending) return;
    setContext('');
    onCancel();
  }

  async function handleVerify() {
    if (!isValid || isPending) return;
    await onVerify(context);
    setContext('');
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <AlertDialogContent data-testid="bulk-verification-modal">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Verify Event &mdash; {alertCount} alerts selected
          </AlertDialogTitle>
          <AlertDialogDescription>
            Provide context for why these alerts are legitimate (e.g., community event, training session).
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
            rows={4}
            placeholder="e.g., Legitimate union meeting at Trade Union Hall, Ibadan North. All submissions collected during meeting hours."
            value={context}
            onChange={(e) => setContext(e.target.value.slice(0, MAX_LENGTH))}
            disabled={isPending}
            data-testid="bulk-verification-context"
            aria-label="Event context"
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>
              {context.length < MIN_LENGTH
                ? `Minimum ${MIN_LENGTH} characters required`
                : 'Event context provided'}
            </span>
            <span data-testid="character-counter">
              {context.length} / {MAX_LENGTH}
            </span>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose} disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleVerify}
            disabled={!isValid || isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="bulk-verify-confirm"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

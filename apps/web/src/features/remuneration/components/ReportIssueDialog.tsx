/**
 * ReportIssueDialog — AlertDialog for reporting payment disputes.
 * Story 6.5 AC2, AC3: Staff submits dispute with required comment (min 10 chars).
 * Pattern: DeactivateDialog.tsx (Radix UI AlertDialog with themed button).
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { useOpenDispute } from '../hooks/useRemuneration';
import type { StaffPaymentRecord } from '../api/remuneration.api';
import { formatNaira } from '../utils/format';

interface ReportIssueDialogProps {
  paymentRecord: StaffPaymentRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportIssueDialog({
  paymentRecord,
  isOpen,
  onClose,
}: ReportIssueDialogProps) {
  const [comment, setComment] = useState('');
  const mutation = useOpenDispute();

  const handleSubmit = () => {
    if (!paymentRecord || comment.length < 10) return;

    mutation.mutate(
      { paymentRecordId: paymentRecord.id, staffComment: comment },
      {
        onSuccess: () => {
          setComment('');
          onClose();
        },
      },
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setComment('');
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Report Payment Issue</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {paymentRecord && (
                <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Tranche:</span>{' '}
                    {paymentRecord.trancheName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Amount:</span>{' '}
                    <span className="font-mono" data-testid="dispute-amount">
                      {formatNaira(paymentRecord.amount)}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Date:</span>{' '}
                    {new Date(paymentRecord.effectiveFrom).toLocaleDateString('en-NG')}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="dispute-comment" className="block text-sm font-medium mb-1">
                  Describe the issue <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="dispute-comment"
                  data-testid="dispute-comment"
                  placeholder="Describe the issue (minimum 10 characters)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  disabled={mutation.isPending}
                />
                {comment.length > 0 && comment.length < 10 && (
                  <p className="text-xs text-red-500 mt-1" data-testid="comment-validation-error">
                    Please describe the issue in at least 10 characters ({comment.length}/10)
                  </p>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleSubmit}
            disabled={comment.length < 10 || mutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="submit-dispute-button"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Dispute'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

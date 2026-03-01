/**
 * Reopen Dispute Dialog
 * Story 6.6: Staff reopens a resolved dispute with a new comment.
 * Pattern: ReportIssueDialog.tsx with amber theme.
 */

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../../components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useReopenDispute } from '../hooks/useRemuneration';

interface ReopenDisputeDialogProps {
  disputeId: string | null;
  reopenCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ReopenDisputeDialog({ disputeId, reopenCount, isOpen, onClose }: ReopenDisputeDialogProps) {
  const [comment, setComment] = useState('');
  const mutation = useReopenDispute();

  const handleSubmit = () => {
    if (!disputeId || comment.length < 10) return;

    mutation.mutate(
      { disputeId, data: { staffComment: comment } },
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
          <AlertDialogTitle>Reopen Payment Dispute</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {reopenCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    This dispute has been reopened {reopenCount} time{reopenCount !== 1 ? 's' : ''} before.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="reopen-comment" className="block text-sm font-medium text-neutral-700 mb-1">
                  Why are you reopening this dispute? <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="reopen-comment"
                  placeholder="Describe why you are reopening (minimum 10 characters)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  disabled={mutation.isPending}
                  data-testid="reopen-comment-input"
                />
                {comment.length > 0 && comment.length < 10 && (
                  <p className="text-xs text-red-500 mt-1" data-testid="reopen-comment-error">
                    Please describe in at least 10 characters ({comment.length}/10)
                  </p>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={mutation.isPending || comment.length < 10}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="reopen-dispute-button"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reopening...
              </>
            ) : (
              'Reopen Dispute'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * AssessorReviewActions Component
 * Story 5.2 AC #3, #4: Final Approve and Reject actions for assessor audit queue.
 *
 * - Final Approve: immediate action with confirmation toast
 * - Reject: AlertDialog requiring mandatory notes (min 10 chars)
 * - Cancel button gets initial focus in reject dialog (safe default per UX spec)
 */

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { CheckCircle, XCircle } from 'lucide-react';
import { FraudResolutionBadge } from './FraudResolutionBadge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import { useAssessorReview } from '../hooks/useAssessor';

interface AssessorReviewActionsProps {
  detectionId: string;
  supervisorResolution: string | null;
  onReviewComplete?: () => void;
}

export function AssessorReviewActions({
  detectionId,
  supervisorResolution,
  onReviewComplete,
}: AssessorReviewActionsProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  const reviewMutation = useAssessorReview();

  // Focus cancel button when reject dialog opens (safe default per UX spec)
  useEffect(() => {
    if (rejectDialogOpen && cancelRef.current) {
      // Small delay to let the dialog render
      const timeout = setTimeout(() => cancelRef.current?.focus(), 50);
      return () => clearTimeout(timeout);
    }
  }, [rejectDialogOpen]);

  const handleApprove = () => {
    reviewMutation.mutate(
      { detectionId, assessorResolution: 'final_approved' },
      {
        onSuccess: () => {
          toast.success('Detection approved — final decision recorded');
          onReviewComplete?.();
        },
      },
    );
  };

  const handleRejectSubmit = () => {
    if (!rejectNotes || rejectNotes.trim().length < 10) {
      setNotesError('Rejection notes are required (minimum 10 characters)');
      return;
    }
    if (rejectNotes.length > 1000) {
      setNotesError('Notes must not exceed 1000 characters');
      return;
    }

    setNotesError('');
    reviewMutation.mutate(
      {
        detectionId,
        assessorResolution: 'final_rejected',
        assessorNotes: rejectNotes.trim(),
      },
      {
        onSuccess: () => {
          toast.error('Detection rejected — final decision recorded');
          setRejectDialogOpen(false);
          setRejectNotes('');
          onReviewComplete?.();
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      {/* Supervisor resolution context */}
      {supervisorResolution && (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <span>Supervisor Decision:</span>
          <FraudResolutionBadge resolution={supervisorResolution} />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          data-testid="assessor-approve-btn"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white transition-colors bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleApprove}
          disabled={reviewMutation.isPending}
        >
          <CheckCircle className="w-4 h-4" />
          {reviewMutation.isPending ? 'Processing...' : 'Final Approve'}
        </button>

        <button
          data-testid="assessor-reject-btn"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setRejectDialogOpen(true)}
          disabled={reviewMutation.isPending}
        >
          <XCircle className="w-4 h-4" />
          Reject
        </button>
      </div>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Detection</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently mark this detection as rejected. Please provide
              mandatory rejection notes explaining the reason.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <textarea
              data-testid="reject-notes-input"
              className="w-full min-h-[100px] p-3 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              placeholder="Enter rejection notes (minimum 10 characters)..."
              value={rejectNotes}
              onChange={(e) => {
                setRejectNotes(e.target.value);
                if (notesError) setNotesError('');
              }}
              maxLength={1000}
            />
            <div className="flex justify-between text-xs">
              {notesError ? (
                <span className="text-red-600">{notesError}</span>
              ) : (
                <span className="text-neutral-400" />
              )}
              <span className="text-neutral-400">{rejectNotes.length}/1000</span>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              ref={cancelRef}
              data-testid="reject-cancel-btn"
            >
              Cancel
            </AlertDialogCancel>
            <button
              data-testid="reject-confirm-btn"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRejectSubmit}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

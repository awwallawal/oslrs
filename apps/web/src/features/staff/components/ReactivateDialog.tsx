/**
 * ReactivateDialog Component
 * Two-tier reactivation: quick restore or full re-onboarding
 */

import { useState, useEffect } from 'react';
import { UserCheck, Loader2, Mail } from 'lucide-react';
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
import type { StaffMember } from '../types';

interface ReactivateDialogProps {
  staff: StaffMember | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (userId: string, reOnboard: boolean) => void;
  isLoading?: boolean;
}

export function ReactivateDialog({
  staff,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: ReactivateDialogProps) {
  const [reOnboard, setReOnboard] = useState(false);

  // Reset checkbox when dialog opens with a new staff member
  useEffect(() => {
    if (isOpen) {
      setReOnboard(false);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (staff) {
      onConfirm(staff.id, reOnboard);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reactivate User</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Are you sure you want to reactivate <strong>{staff?.fullName}</strong>?
              </p>

              {!reOnboard ? (
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-green-800 space-y-1">
                    <p className="font-medium">Quick reactivation will:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Restore the user&apos;s account to active status</li>
                      <li>Allow the user to log in again with existing credentials</li>
                      <li>Restore access based on their assigned role</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Mail className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800 space-y-1">
                    <p className="font-medium">Re-onboarding will:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Reset the user&apos;s password (they must set a new one)</li>
                      <li>Send a new invitation email to complete activation</li>
                      <li>Require the user to go through the full onboarding wizard</li>
                      <li>Profile data (NIN, bank, etc.) will be re-entered</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Re-onboard toggle */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-colors">
                <input
                  type="checkbox"
                  checked={reOnboard}
                  onChange={(e) => setReOnboard(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-900">
                    Require re-onboarding
                  </span>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Sends a new invitation email and requires the user to complete activation again
                  </p>
                </div>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={reOnboard
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-green-600 hover:bg-green-700'
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {reOnboard ? 'Sending...' : 'Reactivating...'}
              </>
            ) : (
              reOnboard ? 'Reactivate & Re-onboard' : 'Reactivate'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

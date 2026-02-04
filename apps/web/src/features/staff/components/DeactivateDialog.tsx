/**
 * DeactivateDialog Component
 * Story 2.5-3, AC4: AlertDialog for deactivating a user
 */

import { AlertTriangle, Loader2 } from 'lucide-react';
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

interface DeactivateDialogProps {
  staff: StaffMember | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (userId: string) => void;
  isLoading?: boolean;
}

export function DeactivateDialog({
  staff,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: DeactivateDialogProps) {
  const handleConfirm = () => {
    if (staff) {
      onConfirm(staff.id);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate User</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Are you sure you want to deactivate <strong>{staff?.fullName}</strong>?
              </p>

              {/* Warning message */}
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800 space-y-1">
                  <p className="font-medium">This action will:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Immediately log the user out of all sessions</li>
                    <li>Prevent the user from logging in</li>
                    <li>Mark their account as deactivated</li>
                  </ul>
                </div>
              </div>

              <p className="text-sm text-neutral-500">
                Deactivated users can be reactivated by a Super Admin if needed.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deactivating...
              </>
            ) : (
              'Deactivate'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

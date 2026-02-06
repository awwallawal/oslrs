/**
 * ReactivateDialog Component
 * AlertDialog for reactivating a deactivated/suspended user
 */

import { UserCheck, Loader2 } from 'lucide-react';
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
  onConfirm: (userId: string) => void;
  isLoading?: boolean;
}

export function ReactivateDialog({
  staff,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: ReactivateDialogProps) {
  const handleConfirm = () => {
    if (staff) {
      onConfirm(staff.id);
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

              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <UserCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-800 space-y-1">
                  <p className="font-medium">This action will:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Restore the user&apos;s account to active status</li>
                    <li>Allow the user to log in again</li>
                    <li>Restore access based on their assigned role</li>
                  </ul>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reactivating...
              </>
            ) : (
              'Reactivate'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

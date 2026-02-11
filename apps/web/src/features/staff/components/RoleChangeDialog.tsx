/**
 * RoleChangeDialog Component
 * Story 2.5-3, AC5: AlertDialog for changing user role
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { getRoleDisplayName } from '@oslsr/types';
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
import { useRoles } from '../hooks/useStaff';
import type { StaffMember } from '../types';

interface RoleChangeDialogProps {
  staff: StaffMember | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (userId: string, roleId: string) => void;
  isLoading?: boolean;
}

export function RoleChangeDialog({
  staff,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: RoleChangeDialogProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const { data: rolesData, isLoading: isLoadingRoles } = useRoles();

  // Reset selected role when dialog opens with a new staff member
  useEffect(() => {
    if (staff?.roleId) {
      setSelectedRoleId(staff.roleId);
    } else {
      setSelectedRoleId('');
    }
  }, [staff]);

  const roles = rolesData?.data ?? [];
  const currentRoleId = staff?.roleId;
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const hasChanged = selectedRoleId !== (currentRoleId ?? '');

  const handleConfirm = () => {
    if (staff && selectedRoleId && hasChanged) {
      onConfirm(staff.id, selectedRoleId);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change Role</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Select a new role for <strong>{staff?.fullName}</strong>:
              </p>

              {/* Role selector */}
              <div className="relative">
                {isLoadingRoles ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      className="w-full appearance-none pl-3 pr-10 py-2.5 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="" disabled>
                        Select a role
                      </option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {getRoleDisplayName(role.name)}
                          {role.id === currentRoleId ? ' (current)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </>
                )}
              </div>

              {selectedRole?.description && (
                <p className="text-sm text-neutral-500">{selectedRole.description}</p>
              )}

              {/* Warning message */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  This will invalidate all active sessions and require the user to log in
                  again with their new permissions.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!hasChanged || isLoading || isLoadingRoles}
            className="bg-primary-600 hover:bg-primary-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Change Role'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

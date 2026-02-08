/**
 * StaffActionsMenu Component
 * Story 2.5-3, AC4: Row actions dropdown with conditional items
 * Uses shadcn/ui DropdownMenu for proper keyboard navigation and a11y
 */

import { MoreHorizontal, Mail, Shield, UserX, UserCheck, CreditCard, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../../components/ui/dropdown-menu';
import type { StaffMember, UserStatus } from '../types';

interface StaffActionsMenuProps {
  staff: StaffMember;
  onResendInvitation: (userId: string) => void;
  onChangeRole: (staff: StaffMember) => void;
  onDeactivate: (staff: StaffMember) => void;
  onReactivate: (staff: StaffMember) => void;
  onDownloadIdCard: (userId: string) => void;
  isResendingInvitation?: boolean;
  isReactivating?: boolean;
  isDownloadingIdCard?: boolean;
}

/**
 * Determines which actions are available based on user status
 */
function getAvailableActions(status: UserStatus) {
  const actions = {
    resendInvitation: false,
    changeRole: false,
    deactivate: false,
    reactivate: false,
    downloadIdCard: false,
  };

  switch (status) {
    case 'invited':
      actions.resendInvitation = true;
      actions.changeRole = true;
      actions.deactivate = true;
      break;
    case 'pending_verification':
      actions.changeRole = true;
      actions.deactivate = true;
      break;
    case 'active':
    case 'verified':
      actions.changeRole = true;
      actions.deactivate = true;
      actions.downloadIdCard = true;
      break;
    case 'suspended':
      actions.changeRole = true;
      actions.reactivate = true;
      break;
    case 'deactivated':
      actions.reactivate = true;
      break;
  }

  return actions;
}

export function StaffActionsMenu({
  staff,
  onResendInvitation,
  onChangeRole,
  onDeactivate,
  onReactivate,
  onDownloadIdCard,
  isResendingInvitation = false,
  isReactivating = false,
  isDownloadingIdCard = false,
}: StaffActionsMenuProps) {
  const actions = getAvailableActions(staff.status);
  const hasAnyAction = Object.values(actions).some(Boolean);

  if (!hasAnyAction) {
    return <span className="text-neutral-300 px-2">-</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Open actions menu"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        {actions.resendInvitation && (
          <DropdownMenuItem
            onClick={() => onResendInvitation(staff.id)}
            disabled={isResendingInvitation}
            className="text-neutral-700"
          >
            {isResendingInvitation ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Resend Invitation
          </DropdownMenuItem>
        )}

        {actions.changeRole && (
          <DropdownMenuItem
            onClick={() => onChangeRole(staff)}
            className="text-neutral-700"
          >
            <Shield className="w-4 h-4" />
            Change Role
          </DropdownMenuItem>
        )}

        {actions.downloadIdCard && (
          <DropdownMenuItem
            onClick={() => onDownloadIdCard(staff.id)}
            disabled={isDownloadingIdCard}
            className="text-neutral-700"
          >
            {isDownloadingIdCard ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            Download ID Card
          </DropdownMenuItem>
        )}

        {actions.reactivate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onReactivate(staff)}
              disabled={isReactivating}
              className="text-green-600 focus:bg-green-50 focus:text-green-600"
            >
              {isReactivating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
              Reactivate
            </DropdownMenuItem>
          </>
        )}

        {actions.deactivate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeactivate(staff)}
              className="text-red-600 focus:bg-red-50 focus:text-red-600"
            >
              <UserX className="w-4 h-4" />
              Deactivate
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * StaffActionsMenu Component
 * Story 2.5-3, AC4: Row actions dropdown with conditional items
 */

import { MoreHorizontal, Mail, Shield, UserX, UserCheck, CreditCard, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const actions = getAvailableActions(staff.status);
  const hasAnyAction = Object.values(actions).some(Boolean);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (!hasAnyAction) {
    return <span className="text-neutral-300 px-2">-</span>;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
        aria-label="Open actions menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10"
          role="menu"
        >
          {actions.resendInvitation && (
            <button
              onClick={() => {
                onResendInvitation(staff.id);
                setIsOpen(false);
              }}
              disabled={isResendingInvitation}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              role="menuitem"
            >
              {isResendingInvitation ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Resend Invitation
            </button>
          )}

          {actions.changeRole && (
            <button
              onClick={() => {
                onChangeRole(staff);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              role="menuitem"
            >
              <Shield className="w-4 h-4" />
              Change Role
            </button>
          )}

          {actions.downloadIdCard && (
            <button
              onClick={() => {
                onDownloadIdCard(staff.id);
                setIsOpen(false);
              }}
              disabled={isDownloadingIdCard}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              role="menuitem"
            >
              {isDownloadingIdCard ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              Download ID Card
            </button>
          )}

          {actions.reactivate && (
            <>
              <div className="border-t border-neutral-200 my-1" />
              <button
                onClick={() => {
                  onReactivate(staff);
                  setIsOpen(false);
                }}
                disabled={isReactivating}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
                role="menuitem"
              >
                {isReactivating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                Reactivate
              </button>
            </>
          )}

          {actions.deactivate && (
            <>
              <div className="border-t border-neutral-200 my-1" />
              <button
                onClick={() => {
                  onDeactivate(staff);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                role="menuitem"
              >
                <UserX className="w-4 h-4" />
                Deactivate
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

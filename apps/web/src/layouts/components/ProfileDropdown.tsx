/**
 * ProfileDropdown Component
 *
 * Story 2.5-1 AC6: Header & Profile Dropdown
 *
 * User dropdown with:
 * - User name display
 * - Avatar (initials if no photo)
 * - "My Profile" link
 * - "Logout" button (red text)
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../features/auth/context/AuthContext';
import { getRoleDisplayName } from '@oslsr/types';
import { getDashboardRoute } from '../../features/dashboard/config/sidebarConfig';
import { cn } from '../../lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

interface ProfileDropdownProps {
  className?: string;
}

/**
 * Get initials from a name (first letter of first and last name)
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ProfileDropdown({ className }: ProfileDropdownProps) {
  const { user, logout, confirmLogout, showLogoutWarning, unsyncedCount, cancelLogout, isLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
      return () => document.removeEventListener('keydown', handleEscKey);
    }
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setIsOpen(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className={cn('h-10 w-10 rounded-full bg-neutral-200 animate-pulse', className)} />
    );
  }

  const displayName = user.fullName || user.email.split('@')[0];
  const initials = getInitials(displayName);
  const roleDisplay = getRoleDisplayName(user.role);
  const profileRoute = `${getDashboardRoute(user.role)}/profile`;

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
          'hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          isOpen && 'bg-neutral-100'
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        {/* Avatar */}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white text-sm font-semibold"
          aria-hidden="true"
        >
          {initials}
        </div>

        {/* Name (hidden on mobile) */}
        <span className="hidden lg:block max-w-[120px] truncate font-medium text-neutral-900">
          {displayName}
        </span>

        <ChevronDown
          className={cn(
            'hidden lg:block h-4 w-4 text-neutral-500 transition-transform',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 w-64 rounded-lg bg-white shadow-lg ring-1 ring-black/5',
            'z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2'
          )}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu"
        >
          {/* User Info Header */}
          <div className="border-b border-neutral-100 p-4">
            <p className="font-medium text-neutral-900 truncate">{displayName}</p>
            <p className="text-sm text-neutral-500 truncate">{user.email}</p>
            <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
              {roleDisplay}
            </span>
          </div>

          {/* Menu Items */}
          <div className="p-1">
            <Link
              to={profileRoute}
              onClick={() => setIsOpen(false)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-700',
                'hover:bg-neutral-100 hover:text-neutral-900 transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
              )}
              role="menuitem"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              My Profile
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm',
                'text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
                isLoggingOut && 'opacity-50 cursor-not-allowed'
              )}
              role="menuitem"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      )}

      {/* Unsynced data logout warning (prep-11: AC6) */}
      <AlertDialog open={showLogoutWarning} onOpenChange={(open) => { if (!open) cancelLogout(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsynced Submissions</AlertDialogTitle>
            <AlertDialogDescription>
              You have {unsyncedCount} unsynced submission{unsyncedCount !== 1 ? 's' : ''}. These will be uploaded when you log back in on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLogout}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await confirmLogout(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

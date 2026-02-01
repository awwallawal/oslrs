/**
 * DashboardHeader Component
 *
 * Story 2.5-1 AC6: Header & Profile Dropdown
 *
 * Features:
 * - Header with OSLSR logo (links to dashboard home)
 * - Role badge display
 * - Profile dropdown with user menu
 * - Mobile hamburger menu trigger
 *
 * Height: 64px desktop, 56px mobile
 */

import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../../features/auth/context/AuthContext';
import { getDashboardRoute, getRoleDisplayName } from '../../features/dashboard/config/sidebarConfig';
import { ProfileDropdown } from './ProfileDropdown';
import { cn } from '../../lib/utils';

interface DashboardHeaderProps {
  onMenuClick?: () => void;
  className?: string;
}

export function DashboardHeader({ onMenuClick, className }: DashboardHeaderProps) {
  const { user } = useAuth();

  const dashboardHome = user ? getDashboardRoute(user.role) : '/dashboard';
  const roleDisplay = user ? getRoleDisplayName(user.role) : '';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-neutral-200 bg-white px-4',
        'md:h-16 md:px-6',
        className
      )}
    >
      {/* Mobile Menu Button */}
      <button
        type="button"
        onClick={onMenuClick}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600',
          'hover:bg-neutral-100 hover:text-neutral-900 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          'lg:hidden'
        )}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Logo */}
      <Link
        to={dashboardHome}
        className={cn(
          'flex items-center gap-3',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg'
        )}
        aria-label="OSLSR Dashboard Home"
      >
        <img
          src="/images/oyo-coat-of-arms.png"
          alt=""
          className="h-8 w-auto md:h-10"
          aria-hidden="true"
        />
        <div className="hidden sm:block">
          <span className="text-lg font-brand font-semibold text-neutral-900">OSLSR</span>
          {roleDisplay && (
            <span className="ml-2 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
              {roleDisplay}
            </span>
          )}
        </div>
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Profile Dropdown */}
        <ProfileDropdown />
      </div>
    </header>
  );
}

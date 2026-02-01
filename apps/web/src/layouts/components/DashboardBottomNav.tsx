/**
 * DashboardBottomNav Component
 *
 * Story 2.5-1 AC1 & AC6: DashboardLayout Component & Mobile Bottom Navigation
 *
 * Mobile: Bottom navigation bar (56px height)
 * Shows 4-5 most important nav items for the current role.
 *
 * Note: Limited to 4-5 items for usability on small screens.
 */

import { NavLink } from 'react-router-dom';
import { User } from 'lucide-react';
import { useAuth } from '../../features/auth/context/AuthContext';
import { getSidebarItems, getDashboardRoute } from '../../features/dashboard/config/sidebarConfig';
import { cn } from '../../lib/utils';

interface DashboardBottomNavProps {
  className?: string;
}

export function DashboardBottomNav({ className }: DashboardBottomNavProps) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  // Get sidebar items and limit to first 4 for bottom nav
  const allItems = getSidebarItems(user.role);
  const bottomNavItems = allItems.slice(0, 4);
  const profileRoute = `${getDashboardRoute(user.role)}/profile`;

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-around',
        'border-t border-neutral-200 bg-white',
        'lg:hidden', // Only show on mobile/tablet
        className
      )}
      aria-label="Mobile navigation"
    >
      {bottomNavItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href.split('/').length <= 3}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px]',
                'text-xs font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset rounded-lg',
                isActive
                  ? 'text-primary-600'
                  : 'text-neutral-500 hover:text-neutral-900'
              )
            }
          >
            <Icon
              className={cn(
                'h-5 w-5',
                'transition-colors'
              )}
              aria-hidden="true"
            />
            <span className="truncate max-w-[60px]">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className={cn(
                  'absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center',
                  'rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white'
                )}
              >
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </NavLink>
        );
      })}

      {/* Profile icon (always last) */}
      <NavLink
        to={profileRoute}
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px]',
            'text-xs font-medium transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset rounded-lg',
            isActive
              ? 'text-primary-600'
              : 'text-neutral-500 hover:text-neutral-900'
          )
        }
              >
        <User className="h-5 w-5" aria-hidden="true" />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

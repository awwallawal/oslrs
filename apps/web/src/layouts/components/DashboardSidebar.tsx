/**
 * DashboardSidebar Component
 *
 * Story 2.5-1 AC1 & AC5: DashboardLayout Component & Dynamic Sidebar Items
 *
 * Desktop: Fixed left sidebar (240px width)
 * Mobile: Hidden (handled by DashboardBottomNav and mobile sheet)
 *
 * Responsive Breakpoints:
 * - < 768px (mobile): Hidden, use bottom nav or hamburger
 * - 768px - 1024px (tablet): Collapsible sidebar, icons only
 * - > 1024px (desktop): Full sidebar with labels
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/AuthContext';
import { getSidebarItems, getDashboardRoute } from '../../features/dashboard/config/sidebarConfig';
import { useUnreadCount } from '../../features/dashboard/hooks/useMessages';
import { SidebarNav } from './SidebarNav';
import { cn } from '../../lib/utils';
import { APP_VERSION } from '../../lib/constants';

interface DashboardSidebarProps {
  className?: string;
}

/**
 * Responsive sidebar:
 * - Mobile (<768px): Hidden, use bottom nav or hamburger
 * - Tablet (768-1024px): Collapsed, icons only (72px)
 * - Desktop (>1024px): Full sidebar with labels (240px)
 */
export function DashboardSidebar({ className }: DashboardSidebarProps) {
  const { user } = useAuth();

  // Story 4.2: Inject unread message count badge for supervisor/enumerator
  const hasMessaging = user?.role === 'supervisor' || user?.role === 'enumerator';
  const { data: unreadData } = useUnreadCount(hasMessaging);
  const unreadCount = unreadData?.count ?? 0;

  const sidebarItems = useMemo(() => {
    if (!user) return [];
    const base = getSidebarItems(user.role);
    if (!hasMessaging || unreadCount === 0) return base;
    return base.map((item) =>
      item.label === 'Messages' ? { ...item, badge: unreadCount } : item,
    );
  }, [user, hasMessaging, unreadCount]);

  if (!user) {
    return null;
  }

  const dashboardHome = getDashboardRoute(user.role);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-neutral-200 bg-white',
        // Tablet (md-lg): Collapsed icons only. Desktop (lg+): Full sidebar
        'md:w-[72px] lg:w-60',
        'transition-all duration-200',
        className
      )}
      aria-label="Dashboard sidebar"
    >
      {/* Logo Section - Responsive: icons on tablet, full on desktop */}
      <div className={cn(
        'flex h-16 items-center border-b border-neutral-200',
        'justify-center px-3 lg:justify-start lg:px-4'
      )}>
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
            className="h-8 lg:h-10 w-auto"
            aria-hidden="true"
          />
          {/* Hide text on tablet, show on desktop */}
          <span className="hidden lg:block text-lg font-brand font-semibold text-neutral-900">
            OSLSR
          </span>
        </Link>
      </div>

      {/* Navigation - Collapsed on tablet, full on desktop */}
      <div className="flex-1 overflow-y-auto p-2 lg:p-4">
        <SidebarNav items={sidebarItems} responsiveCollapse />
      </div>

      {/* Footer - Version or Help link (desktop only) */}
      <div className="border-t border-neutral-200 p-2 lg:p-4">
        <p className="hidden lg:block text-xs text-neutral-400">
          OSLSR v{APP_VERSION}
        </p>
      </div>
    </aside>
  );
}

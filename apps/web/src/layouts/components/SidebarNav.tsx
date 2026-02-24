/**
 * SidebarNav Component
 *
 * Story 2.5-1 AC4 & AC5: Sidebar Active State & Dynamic Sidebar Items
 *
 * Renders navigation items based on user role with proper active state indication.
 *
 * Visual Indicators (AC4):
 * - Active item: Primary color background, white text, left border indicator
 * - Hover state: Subtle background change
 * - Focus state: Visible focus ring for accessibility
 */

import { NavLink } from 'react-router-dom';
import type { NavItem } from '../../features/dashboard/config/sidebarConfig';
import { cn } from '../../lib/utils';

interface SidebarNavProps {
  items: NavItem[];
  collapsed?: boolean;
  /** Use CSS-based responsive collapse (tablet: collapsed, desktop: expanded) */
  responsiveCollapse?: boolean;
  onItemClick?: () => void;
}

export function SidebarNav({ items, collapsed = false, responsiveCollapse = false, onItemClick }: SidebarNavProps) {
  // When collapsed: hide labels entirely via JS
  // When responsiveCollapse: use CSS to show/hide labels based on breakpoint (hidden on md, visible on lg)
  return (
    <nav className="flex flex-col gap-1" role="navigation" aria-label="Dashboard navigation">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.end !== undefined ? item.end : item.href.split('/').length <= 3}
            onClick={onItemClick}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                isActive
                  ? 'bg-primary-600 text-white border-l-4 border-primary-800 ml-0 pl-2.5'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 border-l-4 border-transparent',
                collapsed && 'justify-center px-2',
                // Responsive: center on tablet, normal on desktop
                responsiveCollapse && 'justify-center px-2 lg:justify-start lg:px-3'
              )
            }
          >
            <Icon
              className={cn(
                'h-5 w-5 flex-shrink-0 transition-colors',
                'group-[.bg-primary-600]:text-white',
                'group-hover:text-neutral-900'
              )}
              aria-hidden="true"
            />
            {!collapsed && (
              <span className={cn('truncate', responsiveCollapse && 'hidden lg:inline')}>
                {item.label}
              </span>
            )}
            {!collapsed && item.badge !== undefined && item.badge > 0 && (
              <span
                className={cn(
                  'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  'bg-primary-100 text-primary-700',
                  'group-[.bg-primary-600]:bg-white/20 group-[.bg-primary-600]:text-white'
                )}
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * DashboardLayout Component
 *
 * Story 2.5-1 AC1: DashboardLayout Component
 *
 * Main layout wrapper for all authenticated dashboard pages.
 * Renders with role-appropriate sidebar based on user.role from useAuth().
 *
 * Features:
 * - Role-specific sidebar navigation (AC5)
 * - Header with logo, role badge, profile dropdown (AC6)
 * - Mobile bottom navigation (AC1)
 * - Mobile hamburger sheet for full navigation
 * - Skeleton loading states during data fetch (AC7)
 * - Skip link for accessibility
 *
 * Responsive Breakpoints:
 * - Desktop (>1024px): Fixed left sidebar (240px width), full labels
 * - Tablet (768-1024px): Collapsible sidebar, icons only
 * - Mobile (<768px): Bottom navigation (56px height), hamburger menu
 */

import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SWUpdateBanner } from '../components/SWUpdateBanner';
import { useAuth } from '../features/auth/context/AuthContext';
import { useServiceWorker } from '../hooks/useServiceWorker';
import { getSidebarItems } from '../features/dashboard/config/sidebarConfig';
import { DashboardHeader } from './components/DashboardHeader';
import { DashboardSidebar } from './components/DashboardSidebar';
import { DashboardBottomNav } from './components/DashboardBottomNav';
import { SidebarNav } from './components/SidebarNav';
import { SkeletonCard } from '../components/skeletons';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import { cn } from '../lib/utils';
import { LAYOUT } from '../lib/constants';
import { toast } from 'sonner';

/**
 * Skip to main content link for accessibility (WCAG 2.1 AA requirement)
 */
function DashboardSkipLink() {
  return (
    <a
      href="#dashboard-main-content"
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50',
        'focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
      )}
    >
      Skip to main content
    </a>
  );
}

/**
 * Loading skeleton for dashboard content
 */
function DashboardLoadingSkeleton() {
  return (
    <div className="p-6 space-y-6" aria-busy="true" aria-label="Loading dashboard content">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard className="h-64" />
    </div>
  );
}

export function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const { needRefresh, offlineReady, updateServiceWorker } = useServiceWorker();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const offlineToastShown = useRef(false);

  useEffect(() => {
    if (offlineReady && !offlineToastShown.current) {
      offlineToastShown.current = true;
      try {
        if (sessionStorage.getItem('oslrs-offline-ready-shown') !== '1') {
          toast.success('App ready for offline use!');
          sessionStorage.setItem('oslrs-offline-ready-shown', '1');
        }
      } catch {
        // sessionStorage unavailable
      }
    }
  }, [offlineReady]);

  // Get sidebar items for mobile sheet
  const sidebarItems = user ? getSidebarItems(user.role) : [];

  // Show loading skeleton while auth is loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <DashboardLoadingSkeleton />
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Dashboard Error',
        description: 'Unable to load the dashboard. Please try again.',
      }}
    >
      <div className="min-h-screen bg-neutral-50">
        {needRefresh && (
          <SWUpdateBanner onRefresh={updateServiceWorker} />
        )}
        <DashboardSkipLink />

        <div className={cn('flex h-screen overflow-hidden', needRefresh && 'pt-12')}>
          {/* Desktop Sidebar */}
          <DashboardSidebar />

          {/* Main Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <DashboardHeader onMenuClick={() => setIsMobileNavOpen(true)} />

            {/* Main Content */}
            <main
              id="dashboard-main-content"
              className={cn(
                'flex-1 overflow-y-auto',
                'pb-16 lg:pb-0' // Extra padding for mobile bottom nav
              )}
              tabIndex={-1}
            >
              <Outlet />
            </main>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <DashboardBottomNav />

        {/* Mobile Navigation Sheet */}
        <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
          <SheetContent side="left" className={cn(LAYOUT.MOBILE_SHEET_WIDTH_CLASS, 'p-0')}>
            <SheetHeader className="border-b border-neutral-200 px-4 py-4">
              <SheetTitle className="flex items-center gap-3">
                <img
                  src="/images/oyo-coat-of-arms.png"
                  alt=""
                  className="h-8 w-auto"
                  aria-hidden="true"
                />
                <span className="text-lg font-brand font-semibold text-neutral-900">
                  OSLSR
                </span>
              </SheetTitle>
            </SheetHeader>
            <div className="p-4">
              <SidebarNav
                items={sidebarItems}
                onItemClick={() => setIsMobileNavOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </ErrorBoundary>
  );
}

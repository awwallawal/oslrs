/**
 * Data Entry Clerk Dashboard Home
 *
 * Story 2.5-6 AC1: Desktop-optimized dashboard with Start Data Entry CTA,
 * Today's Progress card, Recent Entries card, keyboard shortcuts section.
 * Story 2.5-6 AC2: Auto-focus on first actionable element.
 * Story 2.5-6 AC4: Single-key shortcuts (N, ?, Esc).
 * Story 2.5-6 AC5: Keyboard shortcuts modal.
 * Story 2.5-6 AC9: Skeleton loading branch.
 *
 * Story 3.6 AC3.6.9: Removed "Coming in Epic 3" modal.
 * Wired "Start Data Entry" to navigate to /dashboard/clerk/surveys.
 * Added SyncStatusBadge and PendingSyncBanner.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, ListOrdered, Keyboard } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { PendingSyncBanner } from '../../../components/PendingSyncBanner';
import { useSyncStatus } from '../../forms/hooks/useSyncStatus';
import { syncManager } from '../../../services/sync-manager';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';

export default function ClerkHome({ isLoading = false }: { isLoading?: boolean }) {
  const navigate = useNavigate();
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const { status, pendingCount, failedCount, rejectedCount, syncingCount } = useSyncStatus();

  // AC2: Auto-focus the CTA button on mount
  useEffect(() => {
    ctaRef.current?.focus();
  }, []);

  // AC4 + AC3.6.9: Single-key shortcuts — N navigates to surveys, ?, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.closest?.('[contenteditable]')) return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          navigate('/dashboard/clerk/surveys');
          break;
        case '?':
          e.preventDefault();
          setShowShortcutsModal(true);
          break;
        case 'escape':
          setShowShortcutsModal(false);
          break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="p-6">
      {/* Sync banner (AC3.6.9 — following EnumeratorHome pattern) */}
      {(pendingCount > 0 || failedCount > 0) && (
        <div className="mb-4">
          <PendingSyncBanner
            pendingCount={pendingCount}
            failedCount={failedCount}
            onSyncNow={() => syncManager.syncNow()}
            onRetryFailed={() => syncManager.retryFailed()}
            isSyncing={syncingCount > 0}
          />
        </div>
      )}

      {/* Page Header — AC1 */}
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          Data Entry Dashboard
        </h1>
        <p className="text-neutral-600 mt-1">
          Keyboard-optimized paper form digitization
        </p>
      </div>

      {/* Sync status badge (AC3.6.9) */}
      {!isLoading && (
        <div className="mb-4">
          <SyncStatusBadge status={status} pendingCount={pendingCount} failedCount={failedCount} rejectedCount={rejectedCount} />
        </div>
      )}

      {isLoading ? (
        /* AC9: Skeleton loading branch — mirrors actual layout: CTA + 2 cards */
        <div className="space-y-6">
          <div className="h-12 w-48 bg-neutral-200 rounded-lg animate-pulse" aria-label="Loading button" />
          <div className="grid gap-6 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ) : (
        <>
          {/* Start Data Entry CTA — AC3.6.9: navigates to surveys */}
          <div className="mb-6">
            <button
              ref={ctaRef}
              onClick={() => navigate('/dashboard/clerk/surveys')}
              className="w-full md:w-auto min-h-[48px] px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg text-lg transition-colors"
              data-testid="start-data-entry"
            >
              Start Data Entry
            </button>
          </div>

          {/* Dashboard Cards — AC1 (desktop-first grid) */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Today's Progress Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <BarChart className="w-5 h-5 text-emerald-600" />
                  </div>
                  <CardTitle className="text-base">Today's Progress</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-neutral-900">0</span>
                    <span className="text-sm text-neutral-500">/ 100 forms today</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: '0%' }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Entries Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <ListOrdered className="w-5 h-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-base">Recent Entries</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <ListOrdered className="w-8 h-8 text-neutral-300 mb-2" />
                  <p className="text-neutral-500 text-sm">No entries yet</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Keyboard Shortcuts Reference — AC4 */}
          <div className="mt-6 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex items-center gap-2 mb-2">
              <Keyboard className="w-4 h-4 text-neutral-500" />
              <span className="text-sm font-medium text-neutral-700">Keyboard Shortcuts</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-neutral-600">
              <span><kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded text-xs font-mono">N</kbd> Start Data Entry</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded text-xs font-mono">?</kbd> Show shortcuts</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded text-xs font-mono">Esc</kbd> Close modal</span>
            </div>
          </div>
        </>
      )}

      {/* Keyboard Shortcuts Modal — AC5 */}
      <AlertDialog open={showShortcutsModal} onOpenChange={setShowShortcutsModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keyboard Shortcuts</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div className="space-y-3 mt-2">
                  <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                    <span className="text-neutral-700">Start Data Entry</span>
                    <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-300 rounded text-sm font-mono">N</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                    <span className="text-neutral-700">Show shortcuts</span>
                    <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-300 rounded text-sm font-mono">?</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-neutral-700">Close modal</span>
                    <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-300 rounded text-sm font-mono">Esc</kbd>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setShowShortcutsModal(false)}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

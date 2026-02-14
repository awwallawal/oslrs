// @vitest-environment jsdom
/**
 * EnumeratorHome Tests
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard
 * Story 3.1: "Start Survey" navigates to surveys page
 * Story 3.2 AC3: Persistent storage request + warning banner
 * Story 3.3: Dynamic sync status badge + pending sync banner
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// Mock usePersistentStorage before importing component
const mockUsePersistentStorage = vi.fn().mockReturnValue({
  isPersisted: true,
  storageQuota: null,
  isSupported: true,
  showWarning: false,
});

vi.mock('../../../../hooks/usePersistentStorage', () => ({
  usePersistentStorage: () => mockUsePersistentStorage(),
}));

// Mock useSyncStatus
const mockUseSyncStatus = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    status: 'synced',
    pendingCount: 0,
    failedCount: 0,
    syncingCount: 0,
    totalCount: 2,
  }),
);

vi.mock('../../../forms/hooks/useSyncStatus', () => ({
  useSyncStatus: mockUseSyncStatus,
}));

// Mock syncManager
const mockSyncNow = vi.hoisted(() => vi.fn());
const mockRetryFailed = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/sync-manager', () => ({
  syncManager: { syncNow: mockSyncNow, retryFailed: mockRetryFailed },
}));

import EnumeratorHome from '../EnumeratorHome';

afterEach(() => {
  cleanup();
});

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderComponent(props?: { isLoading?: boolean }) {
  return render(
    <MemoryRouter>
      <EnumeratorHome {...props} />
    </MemoryRouter>
  );
}

describe('EnumeratorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePersistentStorage.mockReturnValue({
      isPersisted: true,
      storageQuota: null,
      isSupported: true,
      showWarning: false,
    });
    mockUseSyncStatus.mockReturnValue({
      status: 'synced',
      pendingCount: 0,
      failedCount: 0,
      syncingCount: 0,
      totalCount: 2,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('AC1: Dashboard Layout', () => {
    it('renders page heading', () => {
      renderComponent();
      expect(screen.getByText('Enumerator Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Survey collection and progress tracking')).toBeInTheDocument();
    });

    it('renders Start Survey CTA button', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Survey' });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveClass('min-h-[48px]');
    });

    it('renders Resume Draft section with empty state', () => {
      renderComponent();
      expect(screen.getByText('Resume Draft')).toBeInTheDocument();
      expect(screen.getByText('No drafts yet')).toBeInTheDocument();
    });

    it('renders Daily Progress card with placeholder count', () => {
      renderComponent();
      expect(screen.getByText('Daily Progress')).toBeInTheDocument();
      expect(screen.getByText('/ 25 surveys today')).toBeInTheDocument();
    });

    it('renders Sync Status badge with Synced state and status role', () => {
      renderComponent();
      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toBeInTheDocument();
      expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('renders exactly 2 dashboard cards (Resume Draft, Daily Progress)', () => {
      renderComponent();
      const cards = screen.getAllByTestId('dashboard-card');
      expect(cards).toHaveLength(2);
    });
  });

  describe('AC1: Skeleton Loading', () => {
    it('does not render skeleton cards when not loading (default)', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
      expect(screen.getByText('Resume Draft')).toBeInTheDocument();
      expect(screen.getByText('Daily Progress')).toBeInTheDocument();
    });

    it('renders skeleton cards and hides content when loading', () => {
      renderComponent({ isLoading: true });
      const skeletons = screen.getAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(3);
      expect(screen.queryByText('Resume Draft')).not.toBeInTheDocument();
      expect(screen.queryByText('Daily Progress')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('Story 3.1: Start Survey Navigation', () => {
    it('navigates to surveys page on Start Survey click', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Survey' });
      fireEvent.click(cta);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/enumerator/survey');
    });
  });

  describe('Story 3.2 AC3: Persistent Storage', () => {
    it('does not show storage warning when persisted', () => {
      renderComponent();
      expect(
        screen.queryByText(/Storage not secured/)
      ).not.toBeInTheDocument();
    });

    it('shows storage warning banner when persistent storage is denied', () => {
      mockUsePersistentStorage.mockReturnValue({
        isPersisted: false,
        storageQuota: null,
        isSupported: true,
        showWarning: true,
      });
      renderComponent();
      expect(
        screen.getByText('Storage not secured. Avoid clearing browser data to prevent data loss.')
      ).toBeInTheDocument();
    });
  });

  describe('Story 3.3: Dynamic Sync Status', () => {
    it('shows Synced badge when all synced', () => {
      renderComponent();
      expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('shows Syncing badge when items are syncing', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'syncing',
        pendingCount: 2,
        failedCount: 0,
        syncingCount: 1,
        totalCount: 3,
      });
      renderComponent();
      expect(screen.getByText('Syncing')).toBeInTheDocument();
    });

    it('shows Offline badge when offline', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'offline',
        pendingCount: 0,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 1,
      });
      renderComponent();
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('shows Attention badge when failed items exist', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      expect(screen.getByText('Attention')).toBeInTheDocument();
    });

    it('hides badge when status is empty (no submissions)', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'empty',
        pendingCount: 0,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 0,
      });
      renderComponent();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows PendingSyncBanner when pendingCount > 0', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'syncing',
        pendingCount: 3,
        failedCount: 0,
        syncingCount: 1,
        totalCount: 4,
      });
      renderComponent();
      expect(screen.getByText(/3 pending survey/)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('shows failed banner when failedCount > 0', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      expect(screen.getByText(/2 survey\(s\) failed to sync/)).toBeInTheDocument();
    });

    it('does not show PendingSyncBanner when pendingCount and failedCount are 0', () => {
      renderComponent();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('calls syncManager.syncNow on Upload Now click', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'synced',
        pendingCount: 2,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /upload now/i }));
      expect(mockSyncNow).toHaveBeenCalledTimes(1);
    });

    it('calls syncManager.retryFailed on Retry click', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(mockRetryFailed).toHaveBeenCalledTimes(1);
    });
  });
});

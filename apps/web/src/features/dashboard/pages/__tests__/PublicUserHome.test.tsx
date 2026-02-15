// @vitest-environment jsdom
/**
 * PublicUserHome Tests
 *
 * Story 2.5-8 AC1: Mobile-first dashboard with profile status, Survey CTA,
 * Marketplace opt-in, and "Coming Soon" teaser.
 * Story 2.5-8 AC2: Mobile-first layout (2-col max, no 3-col).
 * Story 3.5 AC3.5.5: SyncStatusBadge and PendingSyncBanner rendered.
 * Story 3.5 AC3.5.7: AlertDialog removed, Start Survey navigates to /dashboard/public/surveys.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import PublicUserHome from '../PublicUserHome';

afterEach(() => {
  cleanup();
});

const { mockNavigate, mockSyncManager } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSyncManager: { syncNow: vi.fn(), retryFailed: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockSyncStatus = {
  status: 'synced' as string,
  pendingCount: 0,
  failedCount: 0,
  syncingCount: 0,
};

vi.mock('../../../forms/hooks/useSyncStatus', () => ({
  useSyncStatus: () => mockSyncStatus,
}));

vi.mock('../../../../services/sync-manager', () => ({
  syncManager: mockSyncManager,
}));

vi.mock('../../../../components/SyncStatusBadge', () => ({
  SyncStatusBadge: (props: { status: string; pendingCount: number; failedCount: number }) => (
    <div data-testid="sync-status-badge" data-status={props.status}>
      Sync: {props.status}
    </div>
  ),
}));

vi.mock('../../../../components/PendingSyncBanner', () => ({
  PendingSyncBanner: (props: { pendingCount: number; failedCount: number; onSyncNow: () => void; onRetryFailed: () => void; isSyncing: boolean }) => (
    <div data-testid="sync-banner" role="alert">
      {props.pendingCount} pending, {props.failedCount} failed
      <button onClick={props.onSyncNow}>Upload Now</button>
      <button onClick={props.onRetryFailed}>Retry</button>
    </div>
  ),
}));

// Mock useForms (for SurveyCompletionCard)
let mockCountsReturn = {
  data: undefined as Record<string, number> | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../../forms/hooks/useForms', () => ({
  useMySubmissionCounts: () => mockCountsReturn,
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
  SkeletonText: ({ width }: { width?: string }) => <div aria-label="Loading text" style={{ width }} />,
}));

function renderComponent(props: { isLoading?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <PublicUserHome {...props} />
    </MemoryRouter>
  );
}

describe('PublicUserHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncStatus = { status: 'synced', pendingCount: 0, failedCount: 0, syncingCount: 0 };
    mockCountsReturn = { data: undefined, isLoading: false, error: null };
  });

  describe('AC1: Dashboard Cards', () => {
    it('renders page heading and subtitle', () => {
      renderComponent();
      expect(screen.getByText('My Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Your profile, surveys, and marketplace status')).toBeInTheDocument();
    });

    it('renders Profile Completion card with progress placeholder', () => {
      renderComponent();
      expect(screen.getByText('Profile Completion')).toBeInTheDocument();
      expect(screen.getByText('2 of 5 steps complete')).toBeInTheDocument();
    });

    it('renders Complete Survey CTA card with Start Survey button', () => {
      renderComponent();
      expect(screen.getByText('Complete Survey')).toBeInTheDocument();
      const cta = screen.getByRole('button', { name: 'Start Survey' });
      expect(cta).toBeInTheDocument();
    });

    it('renders Marketplace Opt-In card with Learn More button', () => {
      renderComponent();
      expect(screen.getByText('Marketplace Opt-In')).toBeInTheDocument();
      const btn = screen.getByRole('button', { name: 'Learn More' });
      expect(btn).toBeInTheDocument();
    });
  });

  describe('AC1: Skeleton Loading', () => {
    it('renders 4 skeleton cards when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(4);
    });

    it('hides content when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('Profile Completion')).not.toBeInTheDocument();
      expect(screen.queryByText('Complete Survey')).not.toBeInTheDocument();
      expect(screen.queryByText('Marketplace Opt-In')).not.toBeInTheDocument();
    });

    it('does not render skeleton cards when not loading (default)', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
      expect(screen.getByText('Profile Completion')).toBeInTheDocument();
    });

    it('skeleton grid matches bento layout (2-col md, 3-col lg)', () => {
      renderComponent({ isLoading: true });
      const skeletonGrid = screen.getAllByLabelText('Loading card')[0].parentElement;
      expect(skeletonGrid).toHaveClass('md:grid-cols-2');
      expect(skeletonGrid).toHaveClass('lg:grid-cols-3');
    });
  });

  describe('AC3.5.7: AlertDialog removed, Start Survey navigates', () => {
    it('does NOT show "Coming in Epic 3" modal when Start Survey is clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Survey' }));
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });

    it('navigates to /dashboard/public/surveys on Start Survey click', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Survey' }));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/public/surveys');
    });
  });

  describe('AC1: Coming in Epic 7 Modal', () => {
    it('shows "Coming in Epic 7" modal when Learn More is clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Learn More' }));
      expect(screen.getByText('Coming in Epic 7')).toBeInTheDocument();
      expect(screen.getByText(/employers discover your profile/i)).toBeInTheDocument();
    });

    it('modal has Cancel and Got it buttons', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Learn More' }));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    });

    it('modal can be dismissed with "Got it" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Learn More' }));
      expect(screen.getByText('Coming in Epic 7')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText('Coming in Epic 7')).not.toBeInTheDocument();
    });

    it('modal can be dismissed with "Cancel" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Learn More' }));
      expect(screen.getByText('Coming in Epic 7')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Coming in Epic 7')).not.toBeInTheDocument();
    });
  });

  describe('AC1: Coming Soon Teaser', () => {
    it('renders "Coming Soon: Skills Marketplace Insights" teaser section', () => {
      renderComponent();
      expect(screen.getByText('Coming Soon: Skills Marketplace Insights')).toBeInTheDocument();
      expect(screen.getByText(/opt into the marketplace/i)).toBeInTheDocument();
    });

    it('teaser is hidden during loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('Coming Soon: Skills Marketplace Insights')).not.toBeInTheDocument();
    });
  });

  describe('AC3.5.5: Sync Status Components', () => {
    it('renders SyncStatusBadge when not loading', () => {
      renderComponent();
      expect(screen.getByTestId('sync-status-badge')).toBeInTheDocument();
    });

    it('does not render SyncStatusBadge when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByTestId('sync-status-badge')).not.toBeInTheDocument();
    });

    it('renders PendingSyncBanner when there are pending submissions', () => {
      mockSyncStatus = { status: 'attention', pendingCount: 3, failedCount: 0, syncingCount: 0 };
      renderComponent();
      expect(screen.getByTestId('sync-banner')).toBeInTheDocument();
      expect(screen.getByText(/3 pending/)).toBeInTheDocument();
    });

    it('renders PendingSyncBanner when there are failed submissions', () => {
      mockSyncStatus = { status: 'attention', pendingCount: 0, failedCount: 2, syncingCount: 0 };
      renderComponent();
      expect(screen.getByTestId('sync-banner')).toBeInTheDocument();
      expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    });

    it('does NOT render PendingSyncBanner when no pending or failed', () => {
      mockSyncStatus = { status: 'synced', pendingCount: 0, failedCount: 0, syncingCount: 0 };
      renderComponent();
      expect(screen.queryByTestId('sync-banner')).not.toBeInTheDocument();
    });
  });

  describe('prep-2: SurveyCompletionCard', () => {
    it('shows "Survey Completed" when user has submissions', () => {
      mockCountsReturn = { data: { form1: 1 }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('survey-completion-card')).toBeInTheDocument();
      expect(screen.getByTestId('survey-completed')).toHaveTextContent('Survey Completed');
    });

    it('shows "Not yet submitted" when no submissions', () => {
      mockCountsReturn = { data: {}, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('survey-completion-card')).toBeInTheDocument();
      expect(screen.getByTestId('survey-pending')).toHaveTextContent('Not yet submitted');
    });

    it('shows "Not yet submitted" when counts undefined (no data yet)', () => {
      mockCountsReturn = { data: undefined, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('survey-completion-card')).toBeInTheDocument();
      expect(screen.getByTestId('survey-pending')).toHaveTextContent('Not yet submitted');
    });

    it('gracefully degrades on error', () => {
      mockCountsReturn = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.queryByTestId('survey-completion-card')).not.toBeInTheDocument();
    });
  });

  describe('AC2: Tab Navigation', () => {
    it('no interactive elements have negative tabindex (no focus traps)', () => {
      renderComponent();
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(1);
      focusableElements.forEach((el) => {
        expect(el).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('tab reaches Start Survey and Learn More buttons sequentially', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Start Survey' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Learn More' })).toHaveFocus();
    });
  });
});

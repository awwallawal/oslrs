// @vitest-environment jsdom
/**
 * EnumeratorHome Tests
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard
 * Story 3.1: "Start Survey" navigates to surveys page
 * Story 3.2 AC3: Persistent storage request + warning banner
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

import EnumeratorHome from '../EnumeratorHome';

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

    it('renders Sync Status badge with green Synced state and status role', () => {
      renderComponent();
      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toBeInTheDocument();
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText('Last synced: just now')).toBeInTheDocument();
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

  describe('AC1: Visual Elements', () => {
    it('renders sync status and progress indicators', () => {
      renderComponent();
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText('Last synced: just now')).toBeInTheDocument();
      expect(screen.getByText('/ 25 surveys today')).toBeInTheDocument();
    });
  });
});

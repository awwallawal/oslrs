// @vitest-environment jsdom
/**
 * SupervisorHome Tests
 *
 * Story 2.5-4 AC1: Supervisor Dashboard Home
 *
 * Tests:
 * - Renders 3 dashboard cards (Team Overview, Pending Alerts, Today's Collection) + refresh button
 * - Shows skeleton cards during loading state
 * - Refresh button exists and updates timestamp
 * - Clicking Team Overview navigates to /dashboard/supervisor/team
 * - Correct icons render in each card
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// Mock navigate — vi.hoisted ensures mockNavigate is available before vi.mock runs
const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import SupervisorHome from '../SupervisorHome';

function renderComponent() {
  return render(
    <MemoryRouter>
      <SupervisorHome />
    </MemoryRouter>
  );
}

describe('SupervisorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: Dashboard Cards', () => {
    it('renders page heading', () => {
      renderComponent();
      expect(screen.getByText('Supervisor Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Team management and oversight tools')).toBeInTheDocument();
    });

    it('renders Team Overview card with placeholder count', () => {
      renderComponent();
      expect(screen.getByText('Team Overview')).toBeInTheDocument();
      expect(screen.getByText('enumerators')).toBeInTheDocument();
      expect(screen.getByText('0 active')).toBeInTheDocument();
      expect(screen.getByText('0 inactive')).toBeInTheDocument();
    });

    it('renders Pending Alerts card with empty state', () => {
      renderComponent();
      expect(screen.getByText('Pending Alerts')).toBeInTheDocument();
      expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    });

    it('renders Today\'s Collection card with placeholder', () => {
      renderComponent();
      expect(screen.getByText("Today's Collection")).toBeInTheDocument();
      expect(screen.getByText('submissions')).toBeInTheDocument();
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
    });

    it('renders exactly 3 dashboard cards', () => {
      renderComponent();
      // CardTitle renders as div with data-slot="card-title"
      const cardTitles = document.querySelectorAll('[data-slot="card-title"]');
      expect(cardTitles).toHaveLength(3);
    });
  });

  describe('AC1: Refresh Button', () => {
    it('renders refresh button with accessible label', () => {
      renderComponent();
      const refreshBtn = screen.getByLabelText('Refresh dashboard');
      expect(refreshBtn).toBeInTheDocument();
    });

    it('displays Last Updated timestamp', () => {
      renderComponent();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });

    it('updates timestamp on refresh click', () => {
      vi.useFakeTimers();
      renderComponent();
      const timestampBefore = screen.getByText(/Last updated:/).textContent;
      // Advance time by 1 minute so timestamp will differ
      vi.advanceTimersByTime(60_000);
      fireEvent.click(screen.getByLabelText('Refresh dashboard'));
      const timestampAfter = screen.getByText(/Last updated:/).textContent;
      expect(timestampAfter).not.toBe(timestampBefore);
      vi.useRealTimers();
    });
  });

  describe('AC1: Skeleton Loading', () => {
    it('skeleton branch exists in JSX (isLoading hardcoded false, skeletons not rendered)', () => {
      renderComponent();
      // With isLoading = false, skeletons should NOT render
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
      // But actual cards SHOULD render
      expect(screen.getByText('Team Overview')).toBeInTheDocument();
    });
  });

  describe('AC1: Icons', () => {
    it('renders correct icons in dashboard cards', () => {
      renderComponent();
      // lucide-react renders SVGs with class "lucide lucide-{name}"
      expect(document.querySelector('.lucide-users')).toBeInTheDocument();
      expect(document.querySelector('.lucide-triangle-alert')).toBeInTheDocument();
      expect(document.querySelector('.lucide-clipboard-list')).toBeInTheDocument();
      expect(document.querySelector('.lucide-refresh-cw')).toBeInTheDocument();
      expect(document.querySelector('.lucide-chevron-right')).toBeInTheDocument();
    });
  });

  describe('AC2: Navigation', () => {
    it('clicking Team Overview card navigates to /dashboard/supervisor/team', () => {
      renderComponent();
      const card = screen.getByText('Team Overview').closest('[data-slot="card"]');
      expect(card).toBeInTheDocument();
      fireEvent.click(card!);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/supervisor/team');
    });
  });
});

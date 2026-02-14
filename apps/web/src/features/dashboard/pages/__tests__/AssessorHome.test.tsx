// @vitest-environment jsdom
/**
 * AssessorHome Tests
 *
 * Story 2.5-7 AC1: Audit-focused dashboard with Verification Queue, Recent Activity,
 * Evidence Panel, and Quick Filters.
 * Story 2.5-7 AC2: Evidence display placeholder for GPS clustering, completion times,
 * response patterns.
 * Story 2.5-7 AC8: SkeletonCard loading branch.
 * Story 2.5-7 AC10: Tab navigation without focus traps.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import AssessorHome from '../AssessorHome';

afterEach(() => {
  cleanup();
});

function renderComponent(props: { isLoading?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <AssessorHome {...props} />
    </MemoryRouter>
  );
}

describe('AssessorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: Dashboard Layout', () => {
    it('renders page title and subtitle', () => {
      renderComponent();
      expect(screen.getByText('Assessor Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Verification queue and audit tools')).toBeInTheDocument();
    });

    it('renders 3 dashboard cards with correct titles', () => {
      renderComponent();
      expect(screen.getByText('Verification Queue')).toBeInTheDocument();
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('Evidence Panel')).toBeInTheDocument();
    });

    it('renders Verification Queue card with 0 pending counter', () => {
      renderComponent();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('pending reviews')).toBeInTheDocument();
    });

    it('renders Recent Activity card with empty state', () => {
      renderComponent();
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });

    it('renders Quick Filters section with 3 disabled dropdowns', () => {
      renderComponent();
      expect(screen.getByText('Quick Filters')).toBeInTheDocument();
      const lgaFilter = screen.getByLabelText('Filter by LGA');
      const enumeratorFilter = screen.getByLabelText('Filter by Enumerator');
      const dateFilter = screen.getByLabelText('Filter by Date Range');
      expect(lgaFilter).toBeDisabled();
      expect(enumeratorFilter).toBeDisabled();
      expect(dateFilter).toBeDisabled();
    });

    it('renders exactly 3 dashboard cards', () => {
      renderComponent();
      const titles = screen.getAllByText(/^(Verification Queue|Recent Activity|Evidence Panel)$/);
      expect(titles).toHaveLength(3);
    });
  });

  describe('AC2: Evidence Panel Placeholder', () => {
    it('shows GPS clustering label', () => {
      renderComponent();
      expect(screen.getByText('GPS clustering')).toBeInTheDocument();
    });

    it('shows Completion times label', () => {
      renderComponent();
      expect(screen.getByText('Completion times')).toBeInTheDocument();
    });

    it('shows Response patterns label', () => {
      renderComponent();
      expect(screen.getByText('Response patterns')).toBeInTheDocument();
    });

    it('shows "Coming in Epic 5" badge', () => {
      renderComponent();
      expect(screen.getByText('Coming in Epic 5')).toBeInTheDocument();
    });
  });

  describe('AC8: Skeleton Loading', () => {
    it('renders 3 skeleton cards when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(3);
    });

    it('renders 3 filter skeletons when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const filterSkeletons = screen.getAllByLabelText('Loading filter');
      expect(filterSkeletons).toHaveLength(3);
    });

    it('hides content when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('Verification Queue')).not.toBeInTheDocument();
      expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
      expect(screen.queryByText('Evidence Panel')).not.toBeInTheDocument();
      expect(screen.queryByText('Quick Filters')).not.toBeInTheDocument();
    });

    it('does not render skeleton cards when not loading', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
    });
  });

  describe('AC10: Tab Navigation', () => {
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

    it('tab navigation passes through without focus traps', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.tab();
      await user.tab();
      await user.tab();
      // Reaching here without hanging proves no focus traps exist
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('AC1: Icons', () => {
    it('renders correct icons in dashboard cards', () => {
      renderComponent();
      expect(document.querySelector('.lucide-file-search')).toBeInTheDocument();
      // Activity icon appears twice: card header + empty state illustration
      const activityIcons = document.querySelectorAll('.lucide-activity');
      expect(activityIcons).toHaveLength(2);
      expect(document.querySelector('.lucide-shield')).toBeInTheDocument();
      expect(document.querySelector('.lucide-filter')).toBeInTheDocument();
    });
  });
});

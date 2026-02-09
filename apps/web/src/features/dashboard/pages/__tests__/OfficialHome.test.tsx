// @vitest-environment jsdom
/**
 * OfficialHome Tests
 *
 * Story 2.5-7 AC3: Read-only Reports Dashboard with State Overview,
 * Collection Progress, Export Data cards.
 * Story 2.5-7 AC4: ALL elements read-only (no edit/action buttons except Export).
 * Story 2.5-7 AC5: Direction 08 formal government styling.
 * Story 2.5-7 AC8: SkeletonCard loading branch.
 * Story 2.5-7 AC10: Tab navigation without focus traps.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import OfficialHome from '../OfficialHome';

function renderComponent(props: { isLoading?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <OfficialHome {...props} />
    </MemoryRouter>
  );
}

describe('OfficialHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC3: Dashboard Layout', () => {
    it('renders page title and subtitle', () => {
      renderComponent();
      expect(screen.getByText('Reports Dashboard')).toBeInTheDocument();
      expect(screen.getByText('State-level overview and policy reporting')).toBeInTheDocument();
    });

    it('renders 3 dashboard cards with correct titles', () => {
      renderComponent();
      expect(screen.getByText('State Overview')).toBeInTheDocument();
      expect(screen.getByText('Collection Progress')).toBeInTheDocument();
      expect(screen.getByText('Export Data')).toBeInTheDocument();
    });

    it('renders State Overview card with read-only stat placeholders', () => {
      renderComponent();
      expect(screen.getByText('Registrations')).toBeInTheDocument();
      expect(screen.getByText('Active Surveys')).toBeInTheDocument();
      expect(screen.getByText('LGAs Covered')).toBeInTheDocument();
    });

    it('renders Collection Progress card with 0/1,000,000 target', () => {
      renderComponent();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('/ 1,000,000 target')).toBeInTheDocument();
    });

    it('renders Export Data card with Export Report button', () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: 'Export Report' });
      expect(exportBtn).toBeInTheDocument();
    });

    it('clicking Export Report opens "Coming in Epic 5" modal', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Export Report' }));
      expect(screen.getByText('Coming in Epic 5')).toBeInTheDocument();
      expect(screen.getByText(/export functionality/i)).toBeInTheDocument();
    });

    it('modal can be dismissed with "Got it" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Export Report' }));
      expect(screen.getByText('Coming in Epic 5')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText('Coming in Epic 5')).not.toBeInTheDocument();
    });

    it('modal can be dismissed with "Cancel" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Export Report' }));
      expect(screen.getByText('Coming in Epic 5')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Coming in Epic 5')).not.toBeInTheDocument();
    });
  });

  describe('AC4: Read-Only Enforcement', () => {
    it('only has 1 action button (Export Report) — no edit/delete buttons', () => {
      renderComponent();
      const allButtons = screen.getAllByRole('button');
      expect(allButtons).toHaveLength(1);
      expect(allButtons[0]).toHaveTextContent('Export Report');
    });

    it('no input fields exist on the dashboard', () => {
      renderComponent();
      const inputs = document.querySelectorAll('input, textarea');
      expect(inputs).toHaveLength(0);
    });
  });

  describe('AC5: Direction 08 Styling', () => {
    it('renders dark header accent strip with bg-gray-800', () => {
      renderComponent();
      const header = screen.getByText('Reports Dashboard').closest('div');
      expect(header).toHaveClass('bg-gray-800', 'text-white');
    });

    it('renders section header with left maroon border', () => {
      renderComponent();
      const sectionHeader = screen.getByText('Overview').closest('div');
      expect(sectionHeader).toHaveClass('border-l-4', 'border-[#9C1E23]', 'pl-4');
    });

    it('renders 3 Direction 08 field groups', () => {
      renderComponent();
      const fieldGroups = screen.getAllByTestId('field-group');
      expect(fieldGroups).toHaveLength(3);
    });

    it('Export Report button uses maroon brand color', () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: 'Export Report' });
      expect(exportBtn).toHaveClass('bg-[#9C1E23]');
    });
  });

  describe('AC8: Skeleton Loading', () => {
    it('renders 3 skeleton cards when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(3);
    });

    it('hides content when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('State Overview')).not.toBeInTheDocument();
      expect(screen.queryByText('Collection Progress')).not.toBeInTheDocument();
      expect(screen.queryByText('Export Data')).not.toBeInTheDocument();
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

    it('tab reaches Export Report button and can move past it', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Export Report' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Export Report' })).not.toHaveFocus();
    });
  });

  describe('AC3: Icons', () => {
    it('renders correct icons in dashboard cards', () => {
      renderComponent();
      expect(document.querySelector('.lucide-pie-chart')).toBeInTheDocument();
      expect(document.querySelector('.lucide-trending-up')).toBeInTheDocument();
      expect(document.querySelector('.lucide-download')).toBeInTheDocument();
    });
  });
});

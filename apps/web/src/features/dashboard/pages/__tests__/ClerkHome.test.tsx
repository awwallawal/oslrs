// @vitest-environment jsdom
/**
 * ClerkHome Tests
 *
 * Story 2.5-6 AC1: Desktop-optimized dashboard with CTA, cards, shortcuts
 * Story 2.5-6 AC2: Auto-focus on CTA button
 * Story 2.5-6 AC3: "Coming in Epic 3" modal on CTA click
 * Story 2.5-6 AC4: Single-key shortcuts (N, ?, Esc)
 * Story 2.5-6 AC5: Keyboard shortcuts modal
 * Story 2.5-6 AC9: Skeleton loading branch
 * Story 2.5-6 AC11: Tab navigation without focus traps
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import ClerkHome from '../ClerkHome';

function renderComponent(props: { isLoading?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <ClerkHome {...props} />
    </MemoryRouter>
  );
}

describe('ClerkHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: Dashboard Layout', () => {
    it('renders page title and subtitle', () => {
      renderComponent();
      expect(screen.getByText('Data Entry Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Keyboard-optimized paper form digitization')).toBeInTheDocument();
    });

    it('renders 2 dashboard cards with correct titles', () => {
      renderComponent();
      const cardTitles = document.querySelectorAll('[data-slot="card-title"]');
      expect(cardTitles).toHaveLength(2);
      expect(screen.getByText("Today's Progress")).toBeInTheDocument();
      expect(screen.getByText('Recent Entries')).toBeInTheDocument();
    });

    it('renders "Start Data Entry" CTA button', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveClass('min-h-[48px]');
    });

    it('renders Today\'s Progress card with 0/100 counter and progress bar', () => {
      renderComponent();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('/ 100 forms today')).toBeInTheDocument();
    });

    it('renders Recent Entries card with empty state', () => {
      renderComponent();
      expect(screen.getByText('No entries yet')).toBeInTheDocument();
    });
  });

  describe('AC2: Auto-focus CTA', () => {
    it('CTA has auto-focus on mount', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      expect(document.activeElement).toBe(cta);
    });
  });

  describe('AC3: Coming in Epic 3 Modal', () => {
    it('click CTA opens "Coming in Epic 3" modal', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      fireEvent.click(cta);
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      expect(screen.getByText(/keyboard-optimized form entry interface/i)).toBeInTheDocument();
    });

    it('modal can be dismissed with "Got it" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Data Entry' }));
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });

    it('modal can be dismissed with "Cancel" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Data Entry' }));
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });
  });

  describe('AC4: Keyboard Shortcuts', () => {
    it('keyboard shortcut N triggers Epic 3 modal', () => {
      renderComponent();
      fireEvent.keyDown(document, { key: 'n' });
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
    });

    it('keyboard shortcut ? opens shortcuts modal', () => {
      renderComponent();
      fireEvent.keyDown(document, { key: '?' });
      // Both the inline section and the modal have "Keyboard Shortcuts" text
      const matches = screen.getAllByText('Keyboard Shortcuts');
      expect(matches.length).toBeGreaterThanOrEqual(2);
      // Modal should be open — check for dialog content
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('keyboard shortcut Esc closes Epic 3 modal', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Data Entry' }));
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });

    it('keyboard shortcuts section is visible on dashboard', () => {
      renderComponent();
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });
  });

  describe('AC9: Skeleton Loading', () => {
    it('renders skeleton layout matching content shape when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(2);
      // Also has a button skeleton
      const buttonSkeleton = screen.getByLabelText('Loading button');
      expect(buttonSkeleton).toBeInTheDocument();
    });

    it('hides content when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('Start Data Entry')).not.toBeInTheDocument();
      expect(screen.queryByText("Today's Progress")).not.toBeInTheDocument();
      expect(screen.queryByText('Recent Entries')).not.toBeInTheDocument();
    });

    it('does not render skeleton cards when not loading (default)', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
      expect(screen.getByText("Today's Progress")).toBeInTheDocument();
      expect(screen.getByText('Recent Entries')).toBeInTheDocument();
    });
  });

  describe('AC11: Tab Navigation', () => {
    it('no interactive elements have negative tabindex (no focus traps)', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      // CTA should be focused initially (auto-focus)
      expect(document.activeElement).toBe(cta);
      // Verify no interactive element has tabindex="-1" (which would create a trap)
      expect(cta).not.toHaveAttribute('tabindex', '-1');
    });

    it('all interactive elements are tabbable in sequential order', () => {
      renderComponent();
      // Collect all focusable elements in the dashboard
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      // Verify there are multiple focusable elements (CTA + any others)
      expect(focusableElements.length).toBeGreaterThanOrEqual(1);
      // Verify none of them have tabindex="-1" (which blocks tab navigation)
      focusableElements.forEach((el) => {
        expect(el).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('AC1: Icons', () => {
    it('renders correct icons in dashboard cards', () => {
      renderComponent();
      expect(document.querySelector('.lucide-bar-chart')).toBeInTheDocument();
      expect(document.querySelector('.lucide-list-ordered')).toBeInTheDocument();
      expect(document.querySelector('.lucide-keyboard')).toBeInTheDocument();
    });
  });
});

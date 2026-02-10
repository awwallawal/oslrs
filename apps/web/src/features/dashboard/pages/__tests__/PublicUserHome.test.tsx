// @vitest-environment jsdom
/**
 * PublicUserHome Tests
 *
 * Story 2.5-8 AC1: Mobile-first dashboard with profile status, Survey CTA,
 * Marketplace opt-in, and "Coming Soon" teaser.
 * Story 2.5-8 AC2: Mobile-first layout (2-col max, no 3-col).
 * Story 2.5-8 AC8: .todo() placeholder for audit trail (Epic 6).
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import PublicUserHome from '../PublicUserHome';

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

    it('renders all 3 cards with icons plus teaser icon (4 SVGs total)', () => {
      renderComponent();
      // 4 SVG icons: UserCheck (Profile), ClipboardList (Survey), Briefcase (Marketplace), TrendingUp (Teaser)
      const icons = document.querySelectorAll('svg');
      expect(icons.length).toBe(4);
    });
  });

  describe('AC1: Skeleton Loading', () => {
    it('renders 3 skeleton cards when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(3);
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

    it('skeleton grid matches content grid layout (2-col on md)', () => {
      renderComponent({ isLoading: true });
      const skeletonGrid = screen.getAllByLabelText('Loading card')[0].closest('.grid');
      expect(skeletonGrid).toHaveClass('md:grid-cols-2');
      expect(skeletonGrid).not.toHaveClass('lg:grid-cols-3');
    });
  });

  describe('AC1: Coming in Epic 3 Modal', () => {
    it('shows "Coming in Epic 3" modal when Start Survey is clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Survey' }));
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      expect(screen.getByText(/native form renderer/i)).toBeInTheDocument();
    });

    it('modal has Cancel and Got it buttons', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Survey' }));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    });

    it('modal can be dismissed with "Got it" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Survey' }));
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });

    it('modal can be dismissed with "Cancel" button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Survey' }));
      expect(screen.getByText('Coming in Epic 3')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
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

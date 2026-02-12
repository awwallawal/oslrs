// @vitest-environment jsdom
/**
 * EnumeratorHome Tests
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard
 * Story 3.1: "Start Survey" navigates to surveys page
 * Story 2.5-5 AC5: Service worker registration
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import EnumeratorHome from '../EnumeratorHome';

const mockRegister = vi.fn().mockResolvedValue(undefined);
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderComponent() {
  return render(
    <MemoryRouter>
      <EnumeratorHome />
    </MemoryRouter>
  );
}

describe('EnumeratorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator with serviceWorker support using vi.stubGlobal
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: { register: mockRegister },
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
      const cardTitles = document.querySelectorAll('[data-slot="card-title"]');
      expect(cardTitles).toHaveLength(2);
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
      render(
        <MemoryRouter>
          <EnumeratorHome isLoading />
        </MemoryRouter>
      );
      const skeletons = screen.getAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(3);
      expect(screen.queryByText('Resume Draft')).not.toBeInTheDocument();
      expect(screen.queryByText('Daily Progress')).not.toBeInTheDocument();
      // Sync status badge should be hidden during loading
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

  describe('AC5: Service Worker Registration', () => {
    it('registers service worker on mount', () => {
      renderComponent();
      expect(mockRegister).toHaveBeenCalledWith('/sw.js');
    });

    it('handles browsers without service worker support gracefully', () => {
      // Stub navigator without serviceWorker — explicitly exclude it
      const { serviceWorker: _sw, ...navWithoutSw } = navigator;
      vi.stubGlobal('navigator', navWithoutSw);
      // Should render without errors
      expect(() => renderComponent()).not.toThrow();
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe('AC1: Icons', () => {
    it('renders correct icons in dashboard cards', () => {
      renderComponent();
      expect(document.querySelector('.lucide-save')).toBeInTheDocument();
      expect(document.querySelector('.lucide-trending-up')).toBeInTheDocument();
      expect(document.querySelector('.lucide-circle-check-big')).toBeInTheDocument();
      expect(document.querySelector('.lucide-clock')).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { UserRole } from '@oslsr/types';
import { MobileNav } from './MobileNav';
import * as AuthContext from '../../features/auth/context/AuthContext';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Mock useAuth hook
vi.mock('../../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Default mock return value (not authenticated)
const mockUseAuthNotAuthenticated = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  accessToken: null,
  error: null,
  isRememberMe: false,
  requiresReAuth: false,
  reAuthAction: null,
  loginStaff: vi.fn(),
  loginPublic: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  reAuthenticate: vi.fn(),
  clearError: vi.fn(),
  updateActivity: vi.fn(),
  confirmLogout: vi.fn().mockResolvedValue(undefined),
  unsyncedCount: 0,
  showLogoutWarning: false,
  cancelLogout: vi.fn(),
};

const mockUseAuthAuthenticated = {
  ...mockUseAuthNotAuthenticated,
  isAuthenticated: true,
  user: {
    id: '123',
    email: 'test@example.com',
    fullName: 'Test User',
    role: UserRole.PUBLIC_USER,
    status: 'active',
  },
  accessToken: 'token',
};

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

describe('MobileNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuthContext.useAuth).mockReturnValue(mockUseAuthNotAuthenticated);
  });

  it('renders hamburger menu button', () => {
    renderWithRouter(<MobileNav />);
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('opens drawer when hamburger menu is clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    // Sheet content should be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('shows navigation items when drawer is open (per Story 1.5-6 AC6)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // About and Participate are expandable buttons
      expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /participate/i })).toBeInTheDocument();
      // Support is now expandable per AC6
      expect(screen.getByRole('button', { name: /support/i })).toBeInTheDocument();
      // Marketplace is a link
      expect(screen.getByRole('link', { name: /marketplace/i })).toBeInTheDocument();
      // Contact is now a navigation item per AC6
      expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument();
    });
  });

  it('shows Register CTA when not authenticated (per Story 1.5-8 AC5)', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue(mockUseAuthNotAuthenticated);
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // Register should be visible when not authenticated
      expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
      // Staff Login should NOT be in mobile nav (moved to footer)
      expect(screen.queryByRole('link', { name: /staff login/i })).not.toBeInTheDocument();
    });
  });

  it('shows Dashboard CTA when authenticated (per Story 1.5-8 AC5)', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue(mockUseAuthAuthenticated);
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // Dashboard should be visible when authenticated
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      // Register should NOT be visible
      expect(screen.queryByRole('link', { name: /^register$/i })).not.toBeInTheDocument();
    });
  });

  it('expands About submenu when clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    // Open drawer
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    // Wait for drawer to open, then click About to expand
    const aboutButton = await screen.findByRole('button', { name: /about/i });
    await user.click(aboutButton);

    // Submenu items should be visible
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /the initiative/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /how it works/i })).toBeInTheDocument();
    });
  });

  it('expands Support submenu when clicked (per Story 1.5-6 AC6)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    // Open drawer
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    // Wait for drawer to open, then click Support to expand
    const supportButton = await screen.findByRole('button', { name: /support/i });
    await user.click(supportButton);

    // Submenu items should be visible
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /support center/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /faq/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /guides/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /verify worker/i })).toBeInTheDocument();
    });
  });

  it('has close button in drawer', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close navigation menu/i })).toBeInTheDocument();
    });
  });

  it('drawer has proper aria attributes', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  it('is hidden on desktop (md: breakpoint)', () => {
    renderWithRouter(<MobileNav />);
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toHaveClass('md:hidden');
  });

  it('Contact link has correct href', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      const contactLink = screen.getByRole('link', { name: /contact/i });
      expect(contactLink).toHaveAttribute('href', '/support/contact');
    });
  });

  describe('AC7: Mobile Navigation Sync - Insights', () => {
    it('shows Insights section in mobile nav (per Story 1.5-8 AC7)', async () => {
      const user = userEvent.setup();
      renderWithRouter(<MobileNav />);

      const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /insights/i })).toBeInTheDocument();
      });
    });

    it('Insights section shows Coming Soon label', async () => {
      const user = userEvent.setup();
      renderWithRouter(<MobileNav />);

      const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        const insightsButton = screen.getByRole('button', { name: /insights/i });
        expect(insightsButton.textContent).toContain('Coming Soon');
      });
    });

    it('expands Insights submenu when clicked and shows disabled items', async () => {
      const user = userEvent.setup();
      renderWithRouter(<MobileNav />);

      // Open drawer
      const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
      await user.click(menuButton);

      // Wait for drawer to open, then click Insights to expand
      const insightsButton = await screen.findByRole('button', { name: /insights/i });
      await user.click(insightsButton);

      // Submenu items should be visible but disabled
      await waitFor(() => {
        expect(screen.getByText(/skills map/i)).toBeInTheDocument();
        expect(screen.getByText(/trends/i)).toBeInTheDocument();
        expect(screen.getByText(/reports/i)).toBeInTheDocument();
      });
    });
  });
});

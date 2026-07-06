// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { UserRole } from '@oslsr/types';

import { SmartCta } from './SmartCta';
import * as AuthContext from '../../features/auth/context/AuthContext';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Mock useAuth hook
vi.mock('../../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('SmartCta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Register" link when not logged in (per Story 1.5-8 AC5)', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      error: null,
      isRememberMe: false,
      requiresReAuth: false,
      reAuthAction: null,
      loginStaff: vi.fn(),
      completeStaffLoginAfterMfa: vi.fn(),
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      loginWithMagicLink: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      cancelReAuth: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
      refreshUser: vi.fn(),
      confirmLogout: vi.fn().mockResolvedValue(undefined),
      unsyncedCount: 0,
      showLogoutWarning: false,
      cancelLogout: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const registerLink = screen.getByRole('link', { name: /register/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  // Story 9-39 AC1 — the logged-out "Sign in" door.
  it('also shows a "Sign in" link → /login when not logged in (Story 9-39 AC1)', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      error: null,
      isRememberMe: false,
      requiresReAuth: false,
      reAuthAction: null,
      loginStaff: vi.fn(),
      completeStaffLoginAfterMfa: vi.fn(),
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      loginWithMagicLink: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      cancelReAuth: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
      refreshUser: vi.fn(),
      confirmLogout: vi.fn().mockResolvedValue(undefined),
      unsyncedCount: 0,
      showLogoutWarning: false,
      cancelLogout: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute('href', '/login');
    // Both doors are present together.
    expect(screen.getByRole('link', { name: /register/i })).toHaveAttribute('href', '/register');
  });

  it('shows "Dashboard" link when logged in (per Story 1.5-8 AC5)', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: '123',
        email: 'test@example.com',
        fullName: 'Test User',
        role: UserRole.PUBLIC_USER,
        status: 'active',
      },
      accessToken: 'token',
      error: null,
      isRememberMe: false,
      requiresReAuth: false,
      reAuthAction: null,
      loginStaff: vi.fn(),
      completeStaffLoginAfterMfa: vi.fn(),
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      loginWithMagicLink: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      cancelReAuth: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
      refreshUser: vi.fn(),
      confirmLogout: vi.fn().mockResolvedValue(undefined),
      unsyncedCount: 0,
      showLogoutWarning: false,
      cancelLogout: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    // Story 9-39 AC5 — "Signed in as …" affordance accompanies the Dashboard door.
    expect(screen.getByTestId('smartcta-signed-in-as')).toHaveTextContent(/signed in as/i);
    expect(screen.getByTestId('smartcta-signed-in-as')).toHaveTextContent('Test User');
    // No "Sign in" / "Register" doors when authenticated.
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^register$/i })).not.toBeInTheDocument();
  });

  it('shows loading skeleton during auth check (per Story 1.5-8 AC5)', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      accessToken: null,
      error: null,
      isRememberMe: false,
      requiresReAuth: false,
      reAuthAction: null,
      loginStaff: vi.fn(),
      completeStaffLoginAfterMfa: vi.fn(),
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      loginWithMagicLink: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      cancelReAuth: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
      refreshUser: vi.fn(),
      confirmLogout: vi.fn().mockResolvedValue(undefined),
      unsyncedCount: 0,
      showLogoutWarning: false,
      cancelLogout: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const skeleton = screen.getByRole('status');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('animate-pulse');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links have correct styling with focus-visible', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      error: null,
      isRememberMe: false,
      requiresReAuth: false,
      reAuthAction: null,
      loginStaff: vi.fn(),
      completeStaffLoginAfterMfa: vi.fn(),
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      loginWithMagicLink: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      cancelReAuth: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
      refreshUser: vi.fn(),
      confirmLogout: vi.fn().mockResolvedValue(undefined),
      unsyncedCount: 0,
      showLogoutWarning: false,
      cancelLogout: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const registerLink = screen.getByRole('link', { name: /register/i });
    expect(registerLink).toHaveClass('focus-visible:ring-2');
    expect(registerLink).toHaveClass('bg-primary-600');
  });
});

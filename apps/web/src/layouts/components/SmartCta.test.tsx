// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { UserRole } from '@oslsr/types';

import { SmartCta } from './SmartCta';
import * as AuthContext from '../../features/auth/context/AuthContext';

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
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const registerLink = screen.getByRole('link', { name: /register/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
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
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
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
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
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
      loginPublic: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      reAuthenticate: vi.fn(),
      clearError: vi.fn(),
      updateActivity: vi.fn(),
    });

    renderWithRouter(<SmartCta />);

    const registerLink = screen.getByRole('link', { name: /register/i });
    expect(registerLink).toHaveClass('focus-visible:ring-2');
    expect(registerLink).toHaveClass('bg-primary-600');
  });
});

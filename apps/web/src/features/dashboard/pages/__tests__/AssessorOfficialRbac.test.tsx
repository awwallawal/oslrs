// @vitest-environment jsdom
/**
 * RBAC Route Isolation Tests for Assessor & Official
 *
 * Story 2.5-7 AC6: Assessor accessing /dashboard/official is redirected (and vice versa).
 * Story 2.5-7 AC7: Both roles accessing /dashboard/super-admin are redirected.
 *
 * Full redirect chain: ProtectedRoute (wrong role) → /unauthorized → user navigates to
 * /dashboard → DashboardRedirect → role-specific dashboard.
 * This file tests the ProtectedRoute gate. DashboardRedirect is tested in
 * features/dashboard/__tests__/DashboardRedirect.test.tsx.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

expect.extend(matchers);

import * as AuthContext from '../../../../features/auth/context/AuthContext';
import { ProtectedRoute } from '../../../../features/auth';

// Mock useAuth hook
vi.mock('../../../../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function mockAuth(role: string) {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: 'test-id',
      email: 'test@test.com',
      role,
      firstName: 'Test',
      lastName: 'User',
    },
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    isSessionExpired: false,
    setIsSessionExpired: vi.fn(),
  } as ReturnType<typeof AuthContext.useAuth>);
}

/** Captures redirect state so we can verify ProtectedRoute passes the original path */
function UnauthorizedCapture() {
  const location = useLocation();
  const state = location.state as { from?: string; requiredRoles?: string[] } | null;
  return (
    <div data-testid="unauthorized">
      Unauthorized
      {state?.from && <span data-testid="redirect-from">{state.from}</span>}
      {state?.requiredRoles && <span data-testid="required-roles">{state.requiredRoles.join(',')}</span>}
    </div>
  );
}

function renderRoute(path: string, allowedRoles: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <ProtectedRoute allowedRoles={allowedRoles} redirectTo="/dashboard">
              <div data-testid="protected-content">Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedCapture />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-redirect">Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Assessor & Official RBAC Route Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC6: Cross-role redirect (Assessor ↔ Official)', () => {
    it('assessor accessing /dashboard/official is redirected to /unauthorized', () => {
      mockAuth('verification_assessor');
      renderRoute('/dashboard/official', ['government_official']);
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('official accessing /dashboard/assessor is redirected to /unauthorized', () => {
      mockAuth('government_official');
      renderRoute('/dashboard/assessor', ['verification_assessor']);
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('assessor can access /dashboard/assessor (own route)', () => {
      mockAuth('verification_assessor');
      renderRoute('/dashboard/assessor', ['verification_assessor']);
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('official can access /dashboard/official (own route)', () => {
      mockAuth('government_official');
      renderRoute('/dashboard/official', ['government_official']);
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('AC6: Redirect state preserves origin for downstream redirect', () => {
    it('redirect state contains original path for assessor→official', () => {
      mockAuth('verification_assessor');
      renderRoute('/dashboard/official', ['government_official']);
      expect(screen.getByTestId('redirect-from')).toHaveTextContent('/dashboard/official');
      expect(screen.getByTestId('required-roles')).toHaveTextContent('government_official');
    });

    it('redirect state contains original path for official→assessor', () => {
      mockAuth('government_official');
      renderRoute('/dashboard/assessor', ['verification_assessor']);
      expect(screen.getByTestId('redirect-from')).toHaveTextContent('/dashboard/assessor');
      expect(screen.getByTestId('required-roles')).toHaveTextContent('verification_assessor');
    });
  });

  describe('AC7: Super Admin route isolation', () => {
    it('assessor accessing /dashboard/super-admin is redirected to /unauthorized', () => {
      mockAuth('verification_assessor');
      renderRoute('/dashboard/super-admin', ['super_admin']);
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('official accessing /dashboard/super-admin is redirected to /unauthorized', () => {
      mockAuth('government_official');
      renderRoute('/dashboard/super-admin', ['super_admin']);
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });
});

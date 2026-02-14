// @vitest-environment jsdom
/**
 * Public User RBAC Edge Case Tests
 *
 * Story 2.5-8 AC4: Public user CANNOT access other roles' dashboards.
 * Story 2.5-8 AC5: Verifies public_user coverage in existing RBAC matrix.
 * Story 2.5-8 AC7: TODO placeholder for audit trail logging (Epic 6).
 * Story 2.5-8 AC8: .todo() placeholder for audit log verification (Epic 6).
 *
 * NOTE: The full 7x7 RBAC matrix (53 tests) is in rbac-routes.test.tsx.
 * These tests add public-user-specific edge cases and focused scenarios.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '../../../auth/components/ProtectedRoute';
import { AuthContext } from '../../../auth/context/AuthContext';
import { UserRole } from '@oslsr/types';
import type { AuthUser } from '@oslsr/types';

afterEach(() => {
  cleanup();
});

const createMockUser = (role: AuthUser['role']): AuthUser => ({
  id: `user-${role}`,
  email: `${role}@test.com`,
  fullName: `Test ${role}`,
  role,
  status: 'active',
});

function createAuthValue(user: AuthUser) {
  return {
    user,
    accessToken: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    error: null,
    isRememberMe: false,
    requiresReAuth: false,
    reAuthAction: null,
    loginStaff: vi.fn(),
    loginPublic: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    reAuthenticate: vi.fn(),
    clearError: vi.fn(),
    updateActivity: vi.fn(),
  };
}

interface TestProps {
  user: AuthUser;
  initialPath: string;
}

function RBACTestApp({ user, initialPath }: TestProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthContext.Provider value={createAuthValue(user)}>
          <Routes>
            <Route
              path="/dashboard/public/*"
              element={
                <ProtectedRoute allowedRoles={['public_user']} redirectTo="/dashboard">
                  <div data-testid="public-dashboard">Public Dashboard</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/super-admin/*"
              element={
                <ProtectedRoute allowedRoles={['super_admin']} redirectTo="/dashboard">
                  <div data-testid="super-admin-dashboard">Super Admin Dashboard</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/enumerator/*"
              element={
                <ProtectedRoute allowedRoles={['enumerator']} redirectTo="/dashboard">
                  <div data-testid="enumerator-dashboard">Enumerator Dashboard</div>
                </ProtectedRoute>
              }
            />
            <Route path="/unauthorized" element={<div data-testid="unauthorized">Unauthorized</div>} />
            <Route path="/dashboard" element={<div data-testid="dashboard-redirect">Dashboard Redirect</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Public User RBAC Edge Cases (AC4, AC5)', () => {
  it('public user CAN access /dashboard/public', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    render(<RBACTestApp user={user} initialPath="/dashboard/public" />);

    await waitFor(() => {
      expect(screen.getByTestId('public-dashboard')).toBeInTheDocument();
    });
  });

  it('public user accessing /dashboard/super-admin is redirected to /unauthorized', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    render(<RBACTestApp user={user} initialPath="/dashboard/super-admin" />);

    await waitFor(() => {
      expect(screen.queryByTestId('super-admin-dashboard')).not.toBeInTheDocument();
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
    });
  });

  it('public user accessing /dashboard/enumerator is redirected to /unauthorized', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    render(<RBACTestApp user={user} initialPath="/dashboard/enumerator" />);

    await waitFor(() => {
      expect(screen.queryByTestId('enumerator-dashboard')).not.toBeInTheDocument();
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
    });
  });

  it('ProtectedRoute passes redirect state with from path and requiredRoles', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    let capturedState: Record<string, unknown> | null = null;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function UnauthorizedCapture() {
      const location = useLocation();
      capturedState = location.state as Record<string, unknown>;
      return <div data-testid="unauthorized-capture">Unauthorized</div>;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard/super-admin']}>
          <AuthContext.Provider value={createAuthValue(user)}>
            <Routes>
              <Route
                path="/dashboard/super-admin/*"
                element={
                  <ProtectedRoute allowedRoles={['super_admin']} redirectTo="/dashboard">
                    <div>Should not render</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/unauthorized" element={<UnauthorizedCapture />} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('unauthorized-capture')).toBeInTheDocument();
      expect(capturedState).not.toBeNull();
      expect(capturedState?.from).toBe('/dashboard/super-admin');
      expect(capturedState?.requiredRoles).toEqual(['super_admin']);
    });
  });
});

describe('Public User Sub-Route Access (AC3)', () => {
  it('public user CAN access /dashboard/public/surveys', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    render(<RBACTestApp user={user} initialPath="/dashboard/public/surveys" />);

    await waitFor(() => {
      expect(screen.getByTestId('public-dashboard')).toBeInTheDocument();
    });
  });

  it('public user CAN access /dashboard/public/marketplace', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    render(<RBACTestApp user={user} initialPath="/dashboard/public/marketplace" />);

    await waitFor(() => {
      expect(screen.getByTestId('public-dashboard')).toBeInTheDocument();
    });
  });

  it('public user CAN access /dashboard/public/support', async () => {
    const user = createMockUser(UserRole.PUBLIC_USER);
    render(<RBACTestApp user={user} initialPath="/dashboard/public/support" />);

    await waitFor(() => {
      expect(screen.getByTestId('public-dashboard')).toBeInTheDocument();
    });
  });
});

describe('Audit Trail Logging (AC7, AC8) — Blocked on Epic 6', () => {
  // TODO: Audit trail is a backend concern (Epic 6, Story 6-1).
  // Frontend ProtectedRoute already redirects to /unauthorized.
  // Audit logging will be wired when backend audit trail is implemented.
  it.todo('verifies audit log entry on RBAC violation (blocked on Epic 6, Story 6-1)');
  it.todo('verifies audit log contains: attempted route, user ID, role, timestamp (blocked on Epic 6)');
});

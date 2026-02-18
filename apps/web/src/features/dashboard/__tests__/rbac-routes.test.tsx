// @vitest-environment jsdom
/**
 * RBAC Route Protection Matrix Tests
 *
 * Story 2.5-1 AC3: RBAC Route Isolation (Strict)
 *
 * 49 test cases (7 roles x 7 routes):
 * - Each role accessing their own route: ALLOW (7 tests)
 * - Each role accessing other roles' routes: DENY with redirect (42 tests)
 *
 * This ensures strict route isolation per Epic 2.5 security model.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '../../auth/components/ProtectedRoute';
import { AuthContext } from '../../auth/context/AuthContext';
import { UserRole, ALL_ROLES } from '@oslsr/types';
import type { AuthUser } from '@oslsr/types';

afterEach(() => {
  cleanup();
});

// Route configuration matching App.tsx
const ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: '/dashboard/super-admin',
  supervisor: '/dashboard/supervisor',
  enumerator: '/dashboard/enumerator',
  data_entry_clerk: '/dashboard/clerk',
  verification_assessor: '/dashboard/assessor',
  government_official: '/dashboard/official',
  public_user: '/dashboard/public',
};

// Mock user data for different roles
const createMockUser = (role: UserRole): AuthUser => ({
  id: `user-${role}`,
  email: `${role}@test.com`,
  fullName: `Test ${role}`,
  role: role as AuthUser['role'],
  status: 'active',
});

// Test wrapper that simulates the App.tsx route structure
interface TestWrapperProps {
  user: AuthUser;
  initialPath: string;
}

function RBACTestWrapper({ user, initialPath }: TestWrapperProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const mockAuthValue = {
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
    confirmLogout: vi.fn().mockResolvedValue(undefined),
    unsyncedCount: 0,
    showLogoutWarning: false,
    cancelLogout: vi.fn(),
  };

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthContext.Provider value={mockAuthValue}>
          <Routes>
            {/* Dashboard root - redirects to role-specific */}
            <Route path="/dashboard" element={<div data-testid="dashboard-redirect">Dashboard Redirect</div>} />

            {/* Super Admin Routes */}
            <Route
              path="/dashboard/super-admin/*"
              element={
                <ProtectedRoute allowedRoles={['super_admin']} redirectTo="/dashboard">
                  <div data-testid="super-admin-dashboard">Super Admin Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Supervisor Routes */}
            <Route
              path="/dashboard/supervisor/*"
              element={
                <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/dashboard">
                  <div data-testid="supervisor-dashboard">Supervisor Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Enumerator Routes */}
            <Route
              path="/dashboard/enumerator/*"
              element={
                <ProtectedRoute allowedRoles={['enumerator']} redirectTo="/dashboard">
                  <div data-testid="enumerator-dashboard">Enumerator Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Clerk Routes */}
            <Route
              path="/dashboard/clerk/*"
              element={
                <ProtectedRoute allowedRoles={['data_entry_clerk']} redirectTo="/dashboard">
                  <div data-testid="data-entry-clerk-dashboard">Clerk Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Assessor Routes */}
            <Route
              path="/dashboard/assessor/*"
              element={
                <ProtectedRoute allowedRoles={['verification_assessor']} redirectTo="/dashboard">
                  <div data-testid="verification-assessor-dashboard">Assessor Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Official Routes */}
            <Route
              path="/dashboard/official/*"
              element={
                <ProtectedRoute allowedRoles={['government_official']} redirectTo="/dashboard">
                  <div data-testid="government-official-dashboard">Official Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Public User Routes */}
            <Route
              path="/dashboard/public/*"
              element={
                <ProtectedRoute allowedRoles={['public_user']} redirectTo="/dashboard">
                  <div data-testid="public-user-dashboard">Public User Dashboard</div>
                </ProtectedRoute>
              }
            />

            {/* Unauthorized page */}
            <Route path="/unauthorized" element={<div data-testid="unauthorized">Unauthorized</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RBAC Route Protection Matrix (AC3)', () => {
  describe('Each role accessing their OWN dashboard: ALLOW (7 tests)', () => {
    ALL_ROLES.forEach((role) => {
      it(`${role} CAN access ${ROLE_ROUTES[role]}`, async () => {
        const user = createMockUser(role);
        const targetRoute = ROLE_ROUTES[role];
        const expectedTestId = `${role.replaceAll('_', '-')}-dashboard`;

        render(<RBACTestWrapper user={user} initialPath={targetRoute} />);

        await waitFor(() => {
          expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
        });
      });
    });
  });

  describe('Each role accessing OTHER roles dashboards: DENY (42 tests)', () => {
    // Generate all combinations where role tries to access another role's dashboard
    ALL_ROLES.forEach((userRole) => {
      ALL_ROLES.forEach((targetRole) => {
        // Skip same role (those are tested above as ALLOW)
        if (userRole === targetRole) return;

        it(`${userRole} CANNOT access ${ROLE_ROUTES[targetRole]} (redirects to /unauthorized)`, async () => {
          const user = createMockUser(userRole);
          const targetRoute = ROLE_ROUTES[targetRole];

          render(<RBACTestWrapper user={user} initialPath={targetRoute} />);

          await waitFor(() => {
            // Should be redirected to unauthorized page
            expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
          });
        });
      });
    });
  });
});

describe('RBAC Security Validation', () => {
  it('prevents privilege escalation from public_user to super_admin', async () => {
    const publicUser = createMockUser(UserRole.PUBLIC_USER);

    render(<RBACTestWrapper user={publicUser} initialPath="/dashboard/super-admin" />);

    await waitFor(() => {
      // Public user should NOT see super admin dashboard
      expect(screen.queryByTestId('super-admin-dashboard')).not.toBeInTheDocument();
      // Should be redirected to unauthorized
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
    });
  });

  it('prevents cross-role access between enumerator and supervisor', async () => {
    const enumerator = createMockUser(UserRole.ENUMERATOR);

    render(<RBACTestWrapper user={enumerator} initialPath="/dashboard/supervisor" />);

    await waitFor(() => {
      expect(screen.queryByTestId('supervisor-dashboard')).not.toBeInTheDocument();
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
    });
  });

  it('ensures clerk cannot access assessor routes', async () => {
    const clerk = createMockUser(UserRole.DATA_ENTRY_CLERK);

    render(<RBACTestWrapper user={clerk} initialPath="/dashboard/assessor" />);

    await waitFor(() => {
      expect(screen.queryByTestId('assessor-dashboard')).not.toBeInTheDocument();
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
    });
  });

  it('ensures official cannot access supervisor routes', async () => {
    const official = createMockUser(UserRole.GOVERNMENT_OFFICIAL);

    render(<RBACTestWrapper user={official} initialPath="/dashboard/supervisor" />);

    await waitFor(() => {
      expect(screen.queryByTestId('supervisor-dashboard')).not.toBeInTheDocument();
      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
    });
  });
});

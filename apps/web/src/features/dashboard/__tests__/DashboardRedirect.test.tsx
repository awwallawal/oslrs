// @vitest-environment jsdom
/**
 * DashboardRedirect Tests
 *
 * Story 2.5-1 AC2: Root Dashboard Redirect
 *
 * Tests that /dashboard redirects to the correct role-specific dashboard.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardRedirect } from '../components/DashboardRedirect';
import { AuthContext } from '../../auth/context/AuthContext';
import type { AuthUser } from '@oslsr/types';

afterEach(() => {
  cleanup();
});

// Mock user data for different roles
const createMockUser = (role: string): AuthUser => ({
  id: 'user-123',
  email: `${role}@test.com`,
  fullName: `Test ${role}`,
  role: role as AuthUser['role'],
  status: 'active',
});

// Test wrapper with auth context
interface WrapperProps {
  user: AuthUser | null;
  isLoading?: boolean;
  initialEntries?: string[];
}

function TestWrapper({ user, isLoading = false, initialEntries = ['/dashboard'] }: WrapperProps & { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const mockAuthValue = {
    user,
    accessToken: user ? 'mock-token' : null,
    isAuthenticated: !!user,
    isLoading,
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
      <MemoryRouter initialEntries={initialEntries}>
        <AuthContext.Provider value={mockAuthValue}>
          <Routes>
            <Route path="/dashboard" element={<DashboardRedirect />} />
            <Route path="/dashboard/super-admin" element={<div data-testid="super-admin-page">Super Admin Page</div>} />
            <Route path="/dashboard/supervisor" element={<div data-testid="supervisor-page">Supervisor Page</div>} />
            <Route path="/dashboard/enumerator" element={<div data-testid="enumerator-page">Enumerator Page</div>} />
            <Route path="/dashboard/clerk" element={<div data-testid="clerk-page">Clerk Page</div>} />
            <Route path="/dashboard/assessor" element={<div data-testid="assessor-page">Assessor Page</div>} />
            <Route path="/dashboard/official" element={<div data-testid="official-page">Official Page</div>} />
            <Route path="/dashboard/public" element={<div data-testid="public-page">Public Page</div>} />
            <Route path="/" element={<div data-testid="homepage">Homepage</div>} />
            <Route path="/unauthorized" element={<div data-testid="unauthorized-page">Unauthorized</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardRedirect', () => {
  describe('AC2: Root Dashboard Redirect - Role to Route Mapping', () => {
    const roleRedirectTestCases: { role: string; expectedTestId: string; description: string }[] = [
      {
        role: 'super_admin',
        expectedTestId: 'super-admin-page',
        description: 'redirects super_admin to /dashboard/super-admin',
      },
      {
        role: 'supervisor',
        expectedTestId: 'supervisor-page',
        description: 'redirects supervisor to /dashboard/supervisor',
      },
      {
        role: 'enumerator',
        expectedTestId: 'enumerator-page',
        description: 'redirects enumerator to /dashboard/enumerator',
      },
      {
        role: 'data_entry_clerk',
        expectedTestId: 'clerk-page',
        description: 'redirects data_entry_clerk to /dashboard/clerk',
      },
      {
        role: 'verification_assessor',
        expectedTestId: 'assessor-page',
        description: 'redirects verification_assessor to /dashboard/assessor',
      },
      {
        role: 'government_official',
        expectedTestId: 'official-page',
        description: 'redirects government_official to /dashboard/official',
      },
      {
        role: 'public_user',
        expectedTestId: 'public-page',
        description: 'redirects public_user to /dashboard/public',
      },
    ];

    roleRedirectTestCases.forEach(({ role, expectedTestId, description }) => {
      it(description, async () => {
        const user = createMockUser(role);

        render(
          <TestWrapper user={user} initialEntries={['/dashboard']}>
            <></>
          </TestWrapper>
        );

        await waitFor(() => {
          expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
        });
      });
    });

    it('redirects to homepage when not authenticated', async () => {
      render(
        <TestWrapper user={null} initialEntries={['/dashboard']}>
          <></>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('homepage')).toBeInTheDocument();
      });
    });

    it('shows skeleton while loading auth state', async () => {
      render(
        <TestWrapper user={null} isLoading={true} initialEntries={['/dashboard']}>
          <></>
        </TestWrapper>
      );

      // Should show loading state
      expect(screen.getByLabelText('Loading page')).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
/**
 * DashboardLayout Tests
 *
 * Story 2.5-1: Dashboard Layout Architecture & Role-Based Routing
 *
 * Unit tests for:
 * - AC1: DashboardLayout component renders with sidebar/header/content areas
 * - AC5: Sidebar items render dynamically based on user role
 * - AC6: Profile dropdown with logout functionality
 * - AC7: Skeleton loading states display during data fetch
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from '../DashboardLayout';
import { AuthContext } from '../../features/auth/context/AuthContext';
import type { AuthUser } from '@oslsr/types';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Mock user data for different roles
const createMockUser = (role: string): AuthUser => ({
  id: 'user-123',
  email: `${role}@test.com`,
  fullName: `Test ${role}`,
  role: role as AuthUser['role'],
  status: 'active',
});

// Create mock auth value
function createMockAuthValue(user: AuthUser | null, isLoading = false) {
  return {
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
  };
}

// Test wrapper with auth context
interface WrapperProps {
  user: AuthUser | null;
  isLoading?: boolean;
  initialEntries?: string[];
}

function renderWithDashboardLayout(
  { user, isLoading = false, initialEntries = ['/dashboard'] }: WrapperProps
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const mockAuthValue = createMockAuthValue(user, isLoading);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthContext.Provider value={mockAuthValue}>
          <Routes>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<div data-testid="dashboard-content">Dashboard Content</div>} />
              <Route path="*" element={<div data-testid="dashboard-content">Dashboard Content</div>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardLayout', () => {
  describe('AC1: DashboardLayout renders with sidebar/header/content areas', () => {
    it('renders the main layout structure', async () => {
      const user = createMockUser('super_admin');
      renderWithDashboardLayout({ user });

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('renders skip link for accessibility', async () => {
      const user = createMockUser('super_admin');
      renderWithDashboardLayout({ user });

      await waitFor(() => {
        const skipLink = screen.getByText('Skip to main content');
        expect(skipLink).toBeInTheDocument();
        expect(skipLink).toHaveAttribute('href', '#dashboard-main-content');
      });
    });

    it('skip link target element exists with correct id', async () => {
      const user = createMockUser('super_admin');
      renderWithDashboardLayout({ user });

      await waitFor(() => {
        const mainContent = document.getElementById('dashboard-main-content');
        expect(mainContent).toBeInTheDocument();
        expect(mainContent?.tagName.toLowerCase()).toBe('main');
      });
    });
  });

  describe('AC5: Sidebar items render dynamically based on user role', () => {
    const roleTestCases: { role: string; expectedItems: string[] }[] = [
      {
        role: 'super_admin',
        expectedItems: ['Home', 'Staff Management', 'Questionnaires'],
      },
      {
        role: 'supervisor',
        expectedItems: ['Home', 'Team Progress', 'Fraud Alerts'],
      },
      {
        role: 'enumerator',
        expectedItems: ['Home', 'Surveys', 'Drafts'],
      },
      {
        role: 'data_entry_clerk',
        expectedItems: ['Home', 'Entry Queue', 'Completed'],
      },
      {
        role: 'verification_assessor',
        expectedItems: ['Home', 'Audit Queue', 'Evidence'],
      },
      {
        role: 'government_official',
        expectedItems: ['Home', 'Statistics', 'Trends'],
      },
      {
        role: 'public_user',
        expectedItems: ['Home', 'Survey Status', 'Marketplace'],
      },
    ];

    roleTestCases.forEach(({ role, expectedItems }) => {
      it(`renders correct sidebar items for ${role}`, async () => {
        const user = createMockUser(role);
        renderWithDashboardLayout({ user });

        await waitFor(() => {
          expect(screen.getByRole('main')).toBeInTheDocument();
        });

        // Check expected nav items exist
        for (const item of expectedItems) {
          const navItems = screen.getAllByText(item);
          expect(navItems.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('AC7: Skeleton loading states display during data fetch', () => {
    it('shows loading skeleton when auth is loading', () => {
      renderWithDashboardLayout({ user: null, isLoading: true });
      expect(screen.getByLabelText('Loading dashboard content')).toBeInTheDocument();
    });
  });
});

describe('ProfileDropdown', () => {
  describe('AC6: Profile dropdown with logout functionality', () => {
    it('shows user menu button', async () => {
      const user = createMockUser('super_admin');
      renderWithDashboardLayout({ user });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /user menu/i })).toBeInTheDocument();
      });
    });

    it('opens dropdown on click and shows profile/logout options', async () => {
      const user = createMockUser('super_admin');
      const userAction = userEvent.setup();
      renderWithDashboardLayout({ user });

      const menuButton = await screen.findByRole('button', { name: /user menu/i });
      await userAction.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /my profile/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument();
      });
    });

    it('shows role badge in dropdown', async () => {
      const user = createMockUser('supervisor');
      const userAction = userEvent.setup();
      renderWithDashboardLayout({ user });

      const menuButton = await screen.findByRole('button', { name: /user menu/i });
      await userAction.click(menuButton);

      // The role badge should appear in the dropdown menu
      await waitFor(() => {
        // Look for role text in the menu (it appears inside the dropdown)
        const allSupervisorTexts = screen.getAllByText('Supervisor');
        expect(allSupervisorTexts.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('SidebarNav', () => {
  describe('AC4: Active nav item visually indicated', () => {
    it('renders navigation items with proper structure', async () => {
      const user = createMockUser('enumerator');
      renderWithDashboardLayout({ user, initialEntries: ['/dashboard/enumerator'] });

      await waitFor(() => {
        const homeLinks = screen.getAllByText('Home');
        expect(homeLinks.length).toBeGreaterThan(0);
      });
    });
  });
});

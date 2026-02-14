// @vitest-environment jsdom
/**
 * SuperAdminHome Tests
 *
 * Story 2.5-2: Tests for Super Admin dashboard home page
 *
 * Tests:
 * - Loading skeleton renders during fetch
 * - Questionnaire summary card displays correct counts
 * - Staff management card displays
 * - Quick stats card displays
 * - Navigation to questionnaires page on card click
 * - Navigation to staff page on card click
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SuperAdminHome from '../SuperAdminHome';

afterEach(() => {
  cleanup();
});

// Mock the hooks
const mockUseQuestionnaires = vi.fn();

vi.mock('../../../questionnaires/hooks/useQuestionnaires', () => ({
  useQuestionnaires: () => mockUseQuestionnaires(),
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderWithProviders(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {component}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SuperAdminHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading States', () => {
    it('renders loading skeleton when questionnaires data is loading', () => {
      mockUseQuestionnaires.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      renderWithProviders(<SuperAdminHome />);

      // Should show skeleton cards during loading
      expect(screen.getAllByLabelText('Loading card')).toHaveLength(3);
    });
  });

  describe('Questionnaire Summary Card', () => {
    it('displays correct questionnaire counts', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: {
          data: [
            { id: '1', status: 'published' },
            { id: '2', status: 'published' },
            { id: '3', status: 'draft' },
          ],
          meta: { total: 5 },
        },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument(); // Total forms
        expect(screen.getByText('2 published')).toBeInTheDocument();
        expect(screen.getByText('1 drafts')).toBeInTheDocument();
      });
    });

    it('navigates to questionnaires page on card click', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        const card = screen.getByText('Questionnaires').closest('[data-slot="card"]');
        expect(card).toBeInTheDocument();
        fireEvent.click(card!);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/super-admin/questionnaires');
    });
  });

  describe('Staff Management Card', () => {
    it('displays staff management card', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        expect(screen.getByText('Staff Management')).toBeInTheDocument();
        expect(screen.getByText('Manage supervisors, enumerators, and other staff members')).toBeInTheDocument();
      });
    });

    it('navigates to staff page on card click', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        const card = screen.getByText('Staff Management').closest('[data-slot="card"]');
        expect(card).toBeInTheDocument();
        fireEvent.click(card!);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/super-admin/staff');
    });
  });

  describe('Quick Stats Card', () => {
    it('displays active forms count', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: {
          data: [
            { id: '1', status: 'published' },
            { id: '2', status: 'published' },
            { id: '3', status: 'draft' },
          ],
          meta: { total: 5 },
        },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        expect(screen.getByText('Quick Stats')).toBeInTheDocument();
        expect(screen.getByText('Active Forms')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument(); // System Status
      });
    });
  });
});

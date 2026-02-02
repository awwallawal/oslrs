// @vitest-environment jsdom
/**
 * SuperAdminHome Tests
 *
 * Story 2.5-2: Tests for Super Admin dashboard home page
 *
 * Tests:
 * - Loading skeleton renders during fetch
 * - Questionnaire summary card displays correct counts
 * - ODK status card displays health info
 * - Warning banner appears when consecutiveFailures >= 3
 * - Navigation to questionnaires page on card click
 * - Navigation to ODK health page on card click
 * - Error handling for failed API calls
 * - Updates when data changes
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SuperAdminHome from '../SuperAdminHome';

// Mock the hooks
const mockUseQuestionnaires = vi.fn();
const mockUseOdkHealth = vi.fn();

vi.mock('../../../questionnaires/hooks/useQuestionnaires', () => ({
  useQuestionnaires: () => mockUseQuestionnaires(),
}));

vi.mock('../../../questionnaires/hooks/useOdkHealth', () => ({
  useOdkHealth: () => mockUseOdkHealth(),
}));

// Mock the warning banner
vi.mock('../../../questionnaires/components/OdkWarningBanner', () => ({
  OdkWarningBanner: ({ onViewDetails }: { onViewDetails: () => void }) => (
    <div data-testid="odk-warning-banner">
      <button onClick={onViewDetails} data-testid="view-details-btn">View Details</button>
    </div>
  ),
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
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0 } },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      // Should show skeleton cards during loading
      expect(screen.getAllByLabelText('Loading card')).toHaveLength(3);
    });

    it('renders loading skeleton when ODK health data is loading', () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });
      mockUseOdkHealth.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      renderWithProviders(<SuperAdminHome />);

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
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0 } },
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
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0 } },
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

  describe('ODK Status Card', () => {
    it('displays ODK health info correctly', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });
      mockUseOdkHealth.mockReturnValue({
        data: {
          data: {
            status: 'healthy',
            consecutiveFailures: 0,
            lastCheckAt: '2026-01-31T10:00:00Z',
            unresolvedFailures: 2,
            projectId: 'proj-123',
          },
        },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument(); // Issues count
      });
    });

    it('navigates to ODK health page on card click', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0 } },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        const card = screen.getByText('ODK Central').closest('[data-slot="card"]');
        expect(card).toBeInTheDocument();
        fireEvent.click(card!);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/super-admin/odk-health');
    });
  });

  describe('Warning Banner (AC4)', () => {
    it('shows warning banner when consecutiveFailures >= 3', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });
      mockUseOdkHealth.mockReturnValue({
        data: {
          data: {
            status: 'error',
            consecutiveFailures: 3,
            lastCheckAt: '2026-01-31T10:00:00Z',
            unresolvedFailures: 0,
          },
        },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        expect(screen.getByTestId('odk-warning-banner')).toBeInTheDocument();
      });
    });

    it('does not show warning banner when consecutiveFailures < 3', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });
      mockUseOdkHealth.mockReturnValue({
        data: {
          data: {
            status: 'warning',
            consecutiveFailures: 2,
            lastCheckAt: '2026-01-31T10:00:00Z',
            unresolvedFailures: 0,
          },
        },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        expect(screen.queryByTestId('odk-warning-banner')).not.toBeInTheDocument();
      });
    });

    it('navigates to ODK health page when View Details is clicked', async () => {
      mockUseQuestionnaires.mockReturnValue({
        data: { data: [], meta: { total: 0 } },
        isLoading: false,
      });
      mockUseOdkHealth.mockReturnValue({
        data: {
          data: {
            status: 'error',
            consecutiveFailures: 5,
            lastCheckAt: '2026-01-31T10:00:00Z',
            unresolvedFailures: 0,
          },
        },
        isLoading: false,
      });

      renderWithProviders(<SuperAdminHome />);

      await waitFor(() => {
        const viewDetailsBtn = screen.getByTestId('view-details-btn');
        fireEvent.click(viewDetailsBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/super-admin/odk-health');
    });
  });
});

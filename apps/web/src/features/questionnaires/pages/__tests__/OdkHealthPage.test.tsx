// @vitest-environment jsdom
/**
 * OdkHealthPage Tests
 *
 * Story 2.5-2 AC6: Tests for ODK Health dedicated page
 *
 * Tests:
 * - Connection status card renders with health data
 * - Sync failures table renders with data
 * - Retry button triggers mutation
 * - Dismiss button triggers mutation
 * - Empty state when no sync failures
 * - Loading skeleton during fetch
 * - Manual health check button works
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OdkHealthPage from '../OdkHealthPage';

// Mock the hooks
const mockUseOdkHealth = vi.fn();
const mockUseSyncFailures = vi.fn();
const mockTriggerHealthCheck = vi.fn();
const mockRetryMutation = vi.fn();
const mockDismissMutation = vi.fn();

vi.mock('../../hooks/useOdkHealth', () => ({
  useOdkHealth: () => mockUseOdkHealth(),
  useTriggerHealthCheck: () => ({
    mutate: mockTriggerHealthCheck,
    isPending: false,
  }),
  useSyncFailures: () => mockUseSyncFailures(),
  useRetrySyncFailure: () => ({
    mutate: mockRetryMutation,
    isPending: false,
  }),
  useDismissSyncFailure: () => ({
    mutate: mockDismissMutation,
    isPending: false,
  }),
}));

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

describe('OdkHealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading States', () => {
    it('shows loading skeleton during health data fetch', () => {
      mockUseOdkHealth.mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      mockUseSyncFailures.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      expect(screen.getAllByLabelText('Loading card')[0]).toBeInTheDocument();
    });

    it('shows loading skeleton during failures fetch', () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      renderWithProviders(<OdkHealthPage />);

      // Should show table skeleton
      expect(screen.getByLabelText('Loading table')).toBeInTheDocument();
    });
  });

  describe('Connection Status Card', () => {
    it('renders connection status card with health data', async () => {
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
      mockUseSyncFailures.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument(); // Consecutive failures
        expect(screen.getByText('proj-123')).toBeInTheDocument();
      });
    });

    it('manual health check button triggers mutation', async () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      const checkButton = screen.getByRole('button', { name: /check now/i });
      fireEvent.click(checkButton);

      expect(mockTriggerHealthCheck).toHaveBeenCalled();
    });
  });

  describe('Sync Failures Table', () => {
    it('shows sync failures table with data', async () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'warning', consecutiveFailures: 1, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 2, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: {
          data: [
            { id: 'f1', type: 'submission', message: 'Failed to sync submission', createdAt: '2026-01-30T08:00:00Z', retryCount: 2 },
            { id: 'f2', type: 'form', message: 'Form deployment failed', createdAt: '2026-01-29T10:00:00Z', retryCount: 0 },
          ],
        },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      await waitFor(() => {
        expect(screen.getByText('submission')).toBeInTheDocument();
        expect(screen.getByText('Failed to sync submission')).toBeInTheDocument();
        expect(screen.getByText('form')).toBeInTheDocument();
        expect(screen.getByText('Form deployment failed')).toBeInTheDocument();
      });
    });

    it('shows empty state when no failures', async () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'healthy', consecutiveFailures: 0, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 0, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      await waitFor(() => {
        expect(screen.getByText('All sync operations are healthy')).toBeInTheDocument();
        expect(screen.getByText('No unresolved failures at this time.')).toBeInTheDocument();
      });
    });

    it('retry button triggers mutation with failure ID', async () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'warning', consecutiveFailures: 1, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 1, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: {
          data: [
            { id: 'failure-123', type: 'submission', message: 'Error', createdAt: '2026-01-30T08:00:00Z', retryCount: 1 },
          ],
        },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /retry/i });
        fireEvent.click(retryButton);
      });

      expect(mockRetryMutation).toHaveBeenCalledWith('failure-123');
    });

    it('dismiss button opens confirmation dialog', async () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'warning', consecutiveFailures: 1, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 1, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: {
          data: [
            { id: 'failure-456', type: 'form', message: 'Error', createdAt: '2026-01-30T08:00:00Z', retryCount: 0 },
          ],
        },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      // Click dismiss button to open dialog
      await waitFor(() => {
        const dismissButton = screen.getByRole('button', { name: /dismiss/i });
        fireEvent.click(dismissButton);
      });

      // Dialog should be visible
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getByText('Dismiss this failure?')).toBeInTheDocument();
      });
    });

    it('dismiss confirmation triggers mutation with failure ID', async () => {
      mockUseOdkHealth.mockReturnValue({
        data: { data: { status: 'warning', consecutiveFailures: 1, lastCheckAt: '2026-01-31T10:00:00Z', unresolvedFailures: 1, projectId: 'proj-1' } },
        isLoading: false,
      });
      mockUseSyncFailures.mockReturnValue({
        data: {
          data: [
            { id: 'failure-456', type: 'form', message: 'Error', createdAt: '2026-01-30T08:00:00Z', retryCount: 0 },
          ],
        },
        isLoading: false,
      });

      renderWithProviders(<OdkHealthPage />);

      // Click dismiss button to open dialog
      await waitFor(() => {
        const dismissButton = screen.getByRole('button', { name: /dismiss/i });
        fireEvent.click(dismissButton);
      });

      // Click the confirm button in dialog
      await waitFor(() => {
        const dialog = screen.getByRole('alertdialog');
        const confirmButton = dialog.querySelector('button:last-of-type');
        if (confirmButton) {
          fireEvent.click(confirmButton);
        }
      });

      // Mutation should be called with the failure ID
      await waitFor(() => {
        expect(mockDismissMutation).toHaveBeenCalledWith('failure-456');
      });
    });
  });
});

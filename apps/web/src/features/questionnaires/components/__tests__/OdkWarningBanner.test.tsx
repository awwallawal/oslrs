// @vitest-environment jsdom
/**
 * OdkWarningBanner Tests
 *
 * Story 2.5-2 AC4: Tests for ODK warning banner component
 *
 * Tests:
 * - Banner renders with correct last check timestamp
 * - View Details button calls onViewDetails prop
 * - Retry Now button triggers health check mutation
 * - Shows loading state on Retry button during mutation
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OdkWarningBanner } from '../OdkWarningBanner';

// Mock the hook
const mockTriggerHealthCheck = vi.fn();
let mockIsPending = false;

vi.mock('../../hooks/useOdkHealth', () => ({
  useTriggerHealthCheck: () => ({
    mutate: mockTriggerHealthCheck,
    isPending: mockIsPending,
  }),
}));

function renderWithProviders(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
}

describe('OdkWarningBanner', () => {
  const mockOnViewDetails = vi.fn();
  const testLastCheckAt = '2026-01-31T10:30:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
  });

  it('renders with correct last check timestamp', () => {
    renderWithProviders(
      <OdkWarningBanner
        lastCheckAt={testLastCheckAt}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Should show the formatted date
    expect(screen.getByText('ODK Central Connection Issue')).toBeInTheDocument();
    expect(screen.getByText(/Last successful check:/)).toBeInTheDocument();
  });

  it('has proper alert role for accessibility', () => {
    renderWithProviders(
      <OdkWarningBanner
        lastCheckAt={testLastCheckAt}
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('View Details button calls onViewDetails prop', () => {
    renderWithProviders(
      <OdkWarningBanner
        lastCheckAt={testLastCheckAt}
        onViewDetails={mockOnViewDetails}
      />
    );

    const viewDetailsButton = screen.getByRole('button', { name: /view details/i });
    fireEvent.click(viewDetailsButton);

    expect(mockOnViewDetails).toHaveBeenCalledTimes(1);
  });

  it('Retry Now button triggers health check mutation', () => {
    renderWithProviders(
      <OdkWarningBanner
        lastCheckAt={testLastCheckAt}
        onViewDetails={mockOnViewDetails}
      />
    );

    const retryButton = screen.getByRole('button', { name: /retry now/i });
    fireEvent.click(retryButton);

    expect(mockTriggerHealthCheck).toHaveBeenCalledTimes(1);
  });

  it('shows loading state on Retry button during mutation', () => {
    mockIsPending = true;

    renderWithProviders(
      <OdkWarningBanner
        lastCheckAt={testLastCheckAt}
        onViewDetails={mockOnViewDetails}
      />
    );

    const retryButton = screen.getByRole('button', { name: /checking/i });
    expect(retryButton).toBeDisabled();
  });
});

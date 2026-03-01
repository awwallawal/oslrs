// @vitest-environment jsdom
/**
 * ViewAsPage Tests — Role selector for View-As feature
 *
 * Story 6-7 AC #1: Role selector grid with 5 viewable roles
 * Story 6-7 AC #8: Tests for role selector rendering and interactions
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

// ── Mocks ────────────────────────────────────────────────────────────────

const mockMutate = vi.fn();
let mockLgas: Array<{ id: string; name: string }> = [];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../hooks/useViewAs', () => ({
  useStartViewAs: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('../../api/export.api', () => ({
  fetchLgas: () => Promise.resolve(mockLgas),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ViewAsPage from '../ViewAsPage';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLgas = [
    { id: 'lga-1', name: 'Ibadan North' },
    { id: 'lga-2', name: 'Ibadan South' },
  ];
});

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ViewAsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ViewAsPage', () => {
  it('renders role selector grid with 5 viewable roles', () => {
    renderComponent();

    expect(screen.getByTestId('role-grid')).toBeInTheDocument();
    expect(screen.getByTestId('role-card-supervisor')).toBeInTheDocument();
    expect(screen.getByTestId('role-card-enumerator')).toBeInTheDocument();
    expect(screen.getByTestId('role-card-data_entry_clerk')).toBeInTheDocument();
    expect(screen.getByTestId('role-card-verification_assessor')).toBeInTheDocument();
    expect(screen.getByTestId('role-card-government_official')).toBeInTheDocument();
  });

  it('excludes Super Admin and Public User from role grid', () => {
    renderComponent();

    expect(screen.queryByTestId('role-card-super_admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-card-public_user')).not.toBeInTheDocument();
  });

  it('shows LGA dropdown when field role selected', async () => {
    const user = userEvent.setup();
    renderComponent();

    // No LGA selector initially
    expect(screen.queryByTestId('lga-selector')).not.toBeInTheDocument();

    // Click enumerator role
    await user.click(screen.getByTestId('role-card-enumerator'));

    // LGA selector should appear
    expect(screen.getByTestId('lga-selector')).toBeInTheDocument();
  });

  it('"Start Viewing" button disabled until role selected', () => {
    renderComponent();

    const button = screen.getByTestId('start-view-as');
    expect(button).toBeDisabled();
  });

  it('"Start Viewing" button disabled until LGA selected for field roles', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Select a field role
    await user.click(screen.getByTestId('role-card-supervisor'));

    // Button should be disabled (no LGA selected)
    expect(screen.getByTestId('start-view-as')).toBeDisabled();
  });

  it('"Start Viewing" button enabled for non-field roles without LGA', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByTestId('role-card-data_entry_clerk'));

    expect(screen.getByTestId('start-view-as')).not.toBeDisabled();
  });

  it('calls startViewAs mutation on start', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByTestId('role-card-verification_assessor'));
    await user.click(screen.getByTestId('start-view-as'));

    expect(mockMutate).toHaveBeenCalledWith({
      targetRole: 'verification_assessor',
      targetLgaId: undefined,
      reason: undefined,
    });
  });
});

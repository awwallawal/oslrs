// @vitest-environment jsdom
/**
 * ViewAsBanner Tests
 *
 * Story 6-7 AC #2: Banner displays role name, "Read Only", admin name,
 * LGA name display, and "Exit View-As" button. Non-dismissible.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

const mockExitViewAs = vi.fn();

vi.mock('../../context/ViewAsContext', () => ({
  useViewAs: () => ({
    targetRole: 'enumerator',
    targetLgaId: 'lga-123',
    exitViewAs: mockExitViewAs,
  }),
}));

vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: { fullName: 'Admin User', email: 'admin@oslsr.gov.ng', role: 'super_admin' },
  }),
}));

vi.mock('@oslsr/types', () => ({
  getRoleDisplayName: (role: string) => {
    const map: Record<string, string> = {
      enumerator: 'Enumerator',
      supervisor: 'Supervisor',
      data_entry_clerk: 'Data Entry Clerk',
      verification_assessor: 'Verification Assessor',
      government_official: 'Government Official',
    };
    return map[role] ?? role;
  },
}));

vi.mock('../../api/export.api', () => ({
  fetchLgas: () => Promise.resolve([
    { id: 'lga-123', name: 'Ibadan North' },
    { id: 'lga-456', name: 'Ibadan South' },
  ]),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ViewAsBanner } from '../ViewAsBanner';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-populate LGA cache so useQuery returns data synchronously
  queryClient.setQueryData(['lgas'], [
    { id: 'lga-123', name: 'Ibadan North' },
    { id: 'lga-456', name: 'Ibadan South' },
  ]);
  return render(
    <QueryClientProvider client={queryClient}>
      <ViewAsBanner />
    </QueryClientProvider>,
  );
}

describe('ViewAsBanner', () => {
  it('displays role name and "Read Only" text', () => {
    renderBanner();

    expect(screen.getByText(/Viewing as: Enumerator — Read Only/i)).toBeInTheDocument();
  });

  it("displays admin's original name and LGA name", () => {
    renderBanner();

    expect(screen.getByText(/Logged in as: Admin User/i)).toBeInTheDocument();
    expect(screen.getByText(/LGA: Ibadan North/i)).toBeInTheDocument();
  });

  it('"Exit View-As" button calls exitViewAs', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByTestId('exit-view-as'));

    expect(mockExitViewAs).toHaveBeenCalledTimes(1);
  });

  it('banner is not dismissible (no close button)', () => {
    renderBanner();

    // Should not have a dismiss/close button (only Exit View-As button)
    expect(screen.queryByLabelText(/dismiss/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/close/i)).not.toBeInTheDocument();
  });

  it('has appropriate accessibility attributes', () => {
    renderBanner();

    const banner = screen.getByTestId('view-as-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
  });
});

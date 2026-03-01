// @vitest-environment jsdom
/**
 * ViewAsDashboardPage Tests
 *
 * Story 6-7 AC #1: Target role's dashboard renders with sidebar, banner.
 * Story 6-7 AC #2: ViewAsBanner visible.
 * Story 6-7 AC #5: Interactive elements disabled.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Mocks ────────────────────────────────────────────────────────────────

const mockExitViewAs = vi.fn();
let mockViewAsState = {
  isViewingAs: true,
  targetRole: 'supervisor',
  targetLgaId: 'lga-123',
  startedAt: '2026-03-01T10:00:00Z',
  expiresAt: '2026-03-01T10:30:00Z',
  exitViewAs: mockExitViewAs,
  blockAction: vi.fn(),
  isLoading: false,
};

let mockDashboardData: any = {
  data: {
    role: 'supervisor',
    lgaId: 'lga-123',
    cards: [
      { label: 'Team Members', value: 12, description: 'Active enumerators' },
      { label: 'Submissions', value: 450, description: 'Total submissions' },
    ],
    recentActivity: [],
  },
  isLoading: false,
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ role: 'supervisor' }),
    useLocation: () => ({ pathname: '/dashboard/super-admin/view-as/supervisor' }),
  };
});

vi.mock('../../context/ViewAsContext', () => ({
  useViewAs: () => mockViewAsState,
  ViewAsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useViewAs', () => ({
  useViewAsDashboardData: () => mockDashboardData,
  useViewAsState: () => ({
    data: {
      active: true,
      targetRole: 'supervisor',
      targetLgaId: 'lga-123',
      startedAt: '2026-03-01T10:00:00Z',
      expiresAt: '2026-03-01T10:30:00Z',
    },
    isLoading: false,
  }),
  useEndViewAs: () => ({ mutate: mockExitViewAs }),
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
  fetchLgas: () => Promise.resolve([]),
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
import ViewAsDashboardPage from '../ViewAsDashboardPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockViewAsState = {
    isViewingAs: true,
    targetRole: 'supervisor',
    targetLgaId: 'lga-123',
    startedAt: '2026-03-01T10:00:00Z',
    expiresAt: '2026-03-01T10:30:00Z',
    exitViewAs: mockExitViewAs,
    blockAction: vi.fn(),
    isLoading: false,
  };
  mockDashboardData = {
    data: {
      role: 'supervisor',
      lgaId: 'lga-123',
      cards: [
        { label: 'Team Members', value: 12, description: 'Active enumerators' },
        { label: 'Submissions', value: 450, description: 'Total submissions' },
      ],
      recentActivity: [],
    },
    isLoading: false,
  };
});

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard/super-admin/view-as/supervisor']}>
        <ViewAsDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ViewAsDashboardPage', () => {
  it("renders target role's sidebar items", () => {
    renderComponent();

    const sidebar = screen.getByTestId('view-as-sidebar');
    expect(sidebar).toBeInTheDocument();
    expect(screen.getByText('Team Progress')).toBeInTheDocument();
    expect(screen.getByText('Fraud Alerts')).toBeInTheDocument();
  });

  it('renders ViewAsBanner with correct role name', () => {
    renderComponent();

    expect(screen.getByTestId('view-as-banner')).toBeInTheDocument();
    expect(screen.getByText(/Viewing as: Supervisor — Read Only/i)).toBeInTheDocument();
  });

  it("renders dashboard content for target role", () => {
    renderComponent();

    expect(screen.getByTestId('view-as-content')).toBeInTheDocument();
    expect(screen.getByText('Supervisor Dashboard')).toBeInTheDocument();
  });

  it('renders dashboard cards with data', () => {
    renderComponent();

    const cards = screen.getAllByTestId('dashboard-card');
    expect(cards.length).toBe(2);
    expect(screen.getByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Submissions')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockViewAsState = { ...mockViewAsState, isLoading: true };
    renderComponent();

    // Should show spinner, not content
    expect(screen.queryByTestId('view-as-content')).not.toBeInTheDocument();
  });
});

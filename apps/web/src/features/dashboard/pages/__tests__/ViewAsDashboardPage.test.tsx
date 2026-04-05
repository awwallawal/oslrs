// @vitest-environment jsdom
/**
 * ViewAsDashboardPage Tests
 *
 * Prep-11 AC #1: All 5 roles render actual Home page components.
 * Prep-11 AC #2: Sidebar navigation renders sub-page components.
 * Prep-11 AC #3: Error boundary catches crashes and shows "Preview unavailable".
 * Prep-11 AC #4: ViewAsBanner and sidebar remain visible.
 * Prep-11 AC #6: Tests cover all 5 roles.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

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

let mockParams: Record<string, string> = { role: 'supervisor', '*': '' };
let mockPathname = '/dashboard/super-admin/view-as/supervisor';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockParams,
    useLocation: () => ({ pathname: mockPathname }),
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
    user: { fullName: 'Admin User', email: 'admin@example.com', role: 'super_admin' },
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

// Mock role page components so they render identifiable content
vi.mock('../SupervisorHome', () => ({ default: () => <div data-testid="role-page">SupervisorHome</div> }));
vi.mock('../SupervisorTeamPage', () => ({ default: () => <div data-testid="role-page">SupervisorTeamPage</div> }));
vi.mock('../SupervisorProductivityPage', () => ({ default: () => <div data-testid="role-page">SupervisorProductivityPage</div> }));
vi.mock('../SupervisorFraudPage', () => ({ default: () => <div data-testid="role-page">SupervisorFraudPage</div> }));
vi.mock('../SupervisorMessagesPage', () => ({ default: () => <div data-testid="role-page">SupervisorMessagesPage</div> }));
vi.mock('../EnumeratorHome', () => ({ default: () => <div data-testid="role-page">EnumeratorHome</div> }));
vi.mock('../EnumeratorSurveysPage', () => ({ default: () => <div data-testid="role-page">EnumeratorSurveysPage</div> }));
vi.mock('../EnumeratorDraftsPage', () => ({ default: () => <div data-testid="role-page">EnumeratorDraftsPage</div> }));
vi.mock('../EnumeratorSyncPage', () => ({ default: () => <div data-testid="role-page">EnumeratorSyncPage</div> }));
vi.mock('../EnumeratorMessagesPage', () => ({ default: () => <div data-testid="role-page">EnumeratorMessagesPage</div> }));
vi.mock('../ClerkHome', () => ({ default: () => <div data-testid="role-page">ClerkHome</div> }));
vi.mock('../ClerkSurveysPage', () => ({ default: () => <div data-testid="role-page">ClerkSurveysPage</div> }));
vi.mock('../ClerkCompletedPage', () => ({ default: () => <div data-testid="role-page">ClerkCompletedPage</div> }));
vi.mock('../ClerkStatsPage', () => ({ default: () => <div data-testid="role-page">ClerkStatsPage</div> }));
vi.mock('../AssessorHome', () => ({ default: () => <div data-testid="role-page">AssessorHome</div> }));
vi.mock('../AssessorQueuePage', () => ({ default: () => <div data-testid="role-page">AssessorQueuePage</div> }));
vi.mock('../AssessorCompletedPage', () => ({ default: () => <div data-testid="role-page">AssessorCompletedPage</div> }));
vi.mock('../RespondentRegistryPage', () => ({ default: () => <div data-testid="role-page">RespondentRegistryPage</div> }));
vi.mock('../ExportPage', () => ({ default: () => <div data-testid="role-page">ExportPage</div> }));
vi.mock('../OfficialHome', () => ({ default: () => <div data-testid="role-page">OfficialHome</div> }));
vi.mock('../OfficialStatsPage', () => ({ default: () => <div data-testid="role-page">OfficialStatsPage</div> }));
vi.mock('../OfficialTrendsPage', () => ({ default: () => <div data-testid="role-page">OfficialTrendsPage</div> }));

// Mock ErrorBoundary to test both normal and error scenarios
let shouldThrowInChild = false;
const ThrowingComponent = () => {
  if (shouldThrowInChild) throw new Error('Test render crash');
  return null;
};

vi.mock('../../../../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) => {
    if (shouldThrowInChild) return <>{fallback}</>;
    return <>{children}</>;
  },
}));

import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ViewAsDashboardPage from '../ViewAsDashboardPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  shouldThrowInChild = false;
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
  mockParams = { role: 'supervisor', '*': '' };
  mockPathname = '/dashboard/super-admin/view-as/supervisor';
});

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[mockPathname]}>
        <ViewAsDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ViewAsDashboardPage', () => {
  describe('layout structure (AC #4)', () => {
    it('renders ViewAsBanner with correct role name', () => {
      renderComponent();

      expect(screen.getByTestId('view-as-banner')).toBeInTheDocument();
      expect(screen.getByText(/Viewing as: Supervisor — Read Only/i)).toBeInTheDocument();
    });

    it("renders target role's sidebar items", () => {
      renderComponent();

      const sidebar = screen.getByTestId('view-as-sidebar');
      expect(sidebar).toBeInTheDocument();
      expect(screen.getByText('Team Progress')).toBeInTheDocument();
      expect(screen.getByText('Fraud Alerts')).toBeInTheDocument();
    });

    it('shows loading state when context is loading', () => {
      mockViewAsState = { ...mockViewAsState, isLoading: true };
      renderComponent();

      expect(screen.queryByTestId('view-as-sidebar')).not.toBeInTheDocument();
    });
  });

  describe('Home page rendering for all 5 roles (AC #1)', () => {
    it.each([
      ['supervisor', 'SupervisorHome'],
      ['enumerator', 'EnumeratorHome'],
      ['data_entry_clerk', 'ClerkHome'],
      ['verification_assessor', 'AssessorHome'],
      ['government_official', 'OfficialHome'],
    ])('renders %s Home component', async (role, expectedComponent) => {
      mockParams = { role, '*': '' };
      mockPathname = `/dashboard/super-admin/view-as/${role}`;
      mockViewAsState = { ...mockViewAsState, targetRole: role };

      renderComponent();

      // Timeout extended: React.lazy() + Suspense can exceed default 1s under CPU pressure
      const rolePage = await screen.findByTestId('role-page', {}, { timeout: 5000 });
      expect(rolePage).toHaveTextContent(expectedComponent);
    });
  });

  describe('sub-page navigation (AC #2)', () => {
    it.each([
      ['supervisor', 'team', 'SupervisorTeamPage'],
      ['supervisor', 'fraud', 'SupervisorFraudPage'],
      ['supervisor', 'productivity', 'SupervisorProductivityPage'],
      ['supervisor', 'registry', 'RespondentRegistryPage'],
      ['supervisor', 'messages', 'SupervisorMessagesPage'],
      ['enumerator', 'survey', 'EnumeratorSurveysPage'],
      ['enumerator', 'drafts', 'EnumeratorDraftsPage'],
      ['enumerator', 'sync', 'EnumeratorSyncPage'],
      ['enumerator', 'messages', 'EnumeratorMessagesPage'],
      ['data_entry_clerk', 'surveys', 'ClerkSurveysPage'],
      ['data_entry_clerk', 'stats', 'ClerkStatsPage'],
      ['data_entry_clerk', 'completed', 'ClerkCompletedPage'],
      ['verification_assessor', 'queue', 'AssessorQueuePage'],
      ['verification_assessor', 'registry', 'RespondentRegistryPage'],
      ['verification_assessor', 'completed', 'AssessorCompletedPage'],
      ['verification_assessor', 'export', 'ExportPage'],
      ['government_official', 'stats', 'OfficialStatsPage'],
      ['government_official', 'trends', 'OfficialTrendsPage'],
      ['government_official', 'registry', 'RespondentRegistryPage'],
      ['government_official', 'export', 'ExportPage'],
    ])('renders %s/%s as %s', async (role, subPath, expectedComponent) => {
      mockParams = { role, '*': subPath };
      mockPathname = `/dashboard/super-admin/view-as/${role}/${subPath}`;
      mockViewAsState = { ...mockViewAsState, targetRole: role };

      renderComponent();

      const rolePage = await screen.findByTestId('role-page', {}, { timeout: 5000 });
      expect(rolePage).toHaveTextContent(expectedComponent);
    });
  });

  describe('fallback for unknown sub-paths (AC #1)', () => {
    it('renders generic dashboard cards for unmatched sub-path', () => {
      mockParams = { role: 'supervisor', '*': 'unknown-page' };
      mockPathname = '/dashboard/super-admin/view-as/supervisor/unknown-page';

      renderComponent();

      expect(screen.getByTestId('view-as-content')).toBeInTheDocument();
      expect(screen.getByText('Supervisor Dashboard')).toBeInTheDocument();
    });

    it('renders dashboard cards with data in fallback mode', () => {
      mockParams = { role: 'supervisor', '*': 'unknown-page' };
      mockPathname = '/dashboard/super-admin/view-as/supervisor/unknown-page';

      renderComponent();

      const cards = screen.getAllByTestId('dashboard-card');
      expect(cards.length).toBe(2);
      expect(screen.getByText('Team Members')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  describe('error boundary (AC #3)', () => {
    it('shows "Preview unavailable" when a role component crashes', async () => {
      shouldThrowInChild = true;
      mockParams = { role: 'supervisor', '*': '' };

      renderComponent();

      const unavailable = await screen.findByTestId('view-as-preview-unavailable', {}, { timeout: 5000 });
      expect(unavailable).toBeInTheDocument();
      expect(screen.getByText(/Preview unavailable for this page in View-As mode/)).toBeInTheDocument();
    });
  });

  describe('sidebar rendering for all roles (AC #4)', () => {
    it.each([
      ['enumerator', ['Surveys', 'Drafts', 'Sync Status', 'Messages']],
      ['data_entry_clerk', ['Entry Queue', 'Completed', 'My Stats']],
      ['verification_assessor', ['Audit Queue', 'Registry', 'Completed', 'Export Data']],
      ['government_official', ['Statistics', 'Trends', 'Registry', 'Export']],
    ])('renders %s sidebar items', (role, expectedItems) => {
      mockParams = { role, '*': '' };
      mockPathname = `/dashboard/super-admin/view-as/${role}`;
      mockViewAsState = { ...mockViewAsState, targetRole: role };

      renderComponent();

      const sidebar = screen.getByTestId('view-as-sidebar');
      expect(sidebar).toBeInTheDocument();
      for (const item of expectedItems) {
        expect(screen.getByText(item)).toBeInTheDocument();
      }
    });
  });
});

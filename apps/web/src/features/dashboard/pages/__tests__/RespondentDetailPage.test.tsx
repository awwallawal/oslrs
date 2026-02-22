// @vitest-environment jsdom
/**
 * RespondentDetailPage Tests
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * AC1: Full PII fields for authorized roles.
 * AC2: PII hidden for supervisor.
 * AC5: Fraud badge clickable.
 * AC6: Skeleton loading state.
 * AC9: Back button.
 * AC10: Direction 08 styling for official route.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

let mockDetailReturn = {
  data: undefined as any,
  isLoading: false,
  isError: false,
};

let mockUser = { role: 'super_admin', id: 'user-1', email: 'admin@test.com', fullName: 'Admin' };

vi.mock('../../hooks/useRespondent', () => ({
  useRespondentDetail: () => mockDetailReturn,
  respondentKeys: { all: ['respondents'], detail: (id: string) => ['respondents', 'detail', id] },
}));

vi.mock('../../../auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonText: ({ width }: { width?: string }) => <div data-testid="skeleton-text" />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
  SkeletonTable: ({ rows, columns }: { rows: number; columns: number }) => (
    <div data-testid="skeleton-table" />
  ),
}));

vi.mock('../../components/FraudSeverityBadge', () => ({
  FraudSeverityBadge: ({ severity }: { severity: string }) => (
    <span data-testid="fraud-severity-badge">{severity}</span>
  ),
}));

vi.mock('../../components/FraudResolutionBadge', () => ({
  FraudResolutionBadge: ({ resolution }: { resolution: string | null }) => (
    <span data-testid="fraud-resolution-badge">{resolution ?? 'Unreviewed'}</span>
  ),
}));

import RespondentDetailPage from '../RespondentDetailPage';

afterEach(() => {
  cleanup();
});

// ── Test data ────────────────────────────────────────────────────────────────

const fullPiiDetail = {
  id: '018e5f2a-1234-7890-abcd-111111111111',
  nin: '61961438053',
  firstName: 'Adewale',
  lastName: 'Johnson',
  phoneNumber: '+2348012345678',
  dateOfBirth: '1990-05-15',
  lgaId: 'ibadan_north',
  lgaName: 'Ibadan North',
  source: 'enumerator' as const,
  consentMarketplace: true,
  consentEnriched: false,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  submissions: [
    {
      id: '018e5f2a-1234-7890-abcd-333333333333',
      submittedAt: '2026-01-20T14:30:00.000Z',
      formName: 'OSLSR Labour Survey',
      source: 'enumerator',
      enumeratorName: 'Bola Ige',
      processed: true,
      processingError: null,
      fraudDetectionId: '018e5f2a-1234-7890-abcd-555555555555',
      fraudSeverity: 'medium' as const,
      fraudTotalScore: 3.5,
      fraudResolution: null,
    },
  ],
  fraudSummary: {
    highestSeverity: 'medium' as const,
    flaggedSubmissionCount: 1,
    latestResolution: null,
  },
};

const supervisorDetail = {
  ...fullPiiDetail,
  nin: null,
  firstName: null,
  lastName: null,
  phoneNumber: null,
  dateOfBirth: null,
};

// ── Render helpers ───────────────────────────────────────────────────────────

function renderWithRoute(path: string, initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={path} element={<RespondentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDefault() {
  return renderWithRoute(
    '/dashboard/super-admin/respondent/:respondentId',
    '/dashboard/super-admin/respondent/018e5f2a-1234-7890-abcd-111111111111',
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RespondentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin', id: 'user-1', email: 'admin@test.com', fullName: 'Admin' };
    mockDetailReturn = {
      data: fullPiiDetail,
      isLoading: false,
      isError: false,
    };
  });

  describe('AC1: Full PII for authorized roles', () => {
    it('renders full PII fields for super_admin', () => {
      renderDefault();

      // PII fields in the card
      expect(screen.getByText('61961438053')).toBeInTheDocument();
      expect(screen.getByText('+2348012345678')).toBeInTheDocument();
      expect(screen.getByText('1990-05-15')).toBeInTheDocument();
      // Name appears in header + card, use getAllByText
      expect(screen.getAllByText('Adewale Johnson').length).toBeGreaterThanOrEqual(1);
      // LGA appears in both PII and operational cards
      expect(screen.getAllByText('Ibadan North').length).toBeGreaterThanOrEqual(1);
    });

    it('renders PII card for authorized roles', () => {
      renderDefault();

      expect(screen.getByTestId('pii-card')).toBeInTheDocument();
    });
  });

  describe('AC2: PII hidden for supervisor', () => {
    it('does not render PII card for supervisor', () => {
      mockUser = { role: 'supervisor', id: 'user-1', email: 'supervisor@test.com', fullName: 'Super' };
      mockDetailReturn = { data: supervisorDetail, isLoading: false, isError: false };

      renderWithRoute(
        '/dashboard/supervisor/respondent/:respondentId',
        '/dashboard/supervisor/respondent/018e5f2a-1234-7890-abcd-111111111111',
      );

      expect(screen.queryByTestId('pii-card')).not.toBeInTheDocument();
      expect(screen.queryByText('61961438053')).not.toBeInTheDocument();
      expect(screen.queryByText('Adewale Johnson')).not.toBeInTheDocument();
    });

    it('still shows operational card for supervisor', () => {
      mockUser = { role: 'supervisor', id: 'user-1', email: 'supervisor@test.com', fullName: 'Super' };
      mockDetailReturn = { data: supervisorDetail, isLoading: false, isError: false };

      renderWithRoute(
        '/dashboard/supervisor/respondent/:respondentId',
        '/dashboard/supervisor/respondent/018e5f2a-1234-7890-abcd-111111111111',
      );

      expect(screen.getByTestId('operational-card')).toBeInTheDocument();
    });
  });

  describe('AC4: Submission history', () => {
    it('shows submission history table with data', () => {
      renderDefault();

      expect(screen.getByTestId('submissions-table')).toBeInTheDocument();
      expect(screen.getByText('OSLSR Labour Survey')).toBeInTheDocument();
      expect(screen.getByText('Bola Ige')).toBeInTheDocument();
    });

    it('shows empty state when no submissions', () => {
      mockDetailReturn = {
        data: { ...fullPiiDetail, submissions: [], fraudSummary: null },
        isLoading: false,
        isError: false,
      };

      renderDefault();

      expect(screen.getByTestId('empty-submissions')).toBeInTheDocument();
      expect(screen.getByText('No submissions found for this respondent')).toBeInTheDocument();
    });
  });

  describe('AC5: Fraud severity badge clickable', () => {
    it('renders clickable fraud badge on assessor route', () => {
      renderWithRoute(
        '/dashboard/assessor/respondent/:respondentId',
        '/dashboard/assessor/respondent/018e5f2a-1234-7890-abcd-111111111111',
      );

      const badge = screen.getByTestId('fraud-badge-link');
      expect(badge).toBeInTheDocument();
    });

    it('navigates to assessor fraud queue on badge click', () => {
      function LocationDisplay() {
        const loc = useLocation();
        return <div data-testid="location-display">{loc.pathname}{loc.search}</div>;
      }

      render(
        <MemoryRouter initialEntries={['/dashboard/assessor/respondent/018e5f2a-1234-7890-abcd-111111111111']}>
          <Routes>
            <Route
              path="/dashboard/assessor/respondent/:respondentId"
              element={<RespondentDetailPage />}
            />
            <Route path="*" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>,
      );

      const badge = screen.getByTestId('fraud-badge-link');
      fireEvent.click(badge);

      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/dashboard/assessor/queue?detection=018e5f2a-1234-7890-abcd-555555555555',
      );
    });

    it('renders non-clickable fraud badge on super-admin route (no fraud detail route)', () => {
      renderDefault();

      // Super admin has no fraud detail page — badge should render but not be a link
      expect(screen.queryByTestId('fraud-badge-link')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('fraud-severity-badge').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AC6: Skeleton loading state', () => {
    it('shows skeleton when loading', () => {
      mockDetailReturn = { data: undefined, isLoading: true, isError: false };

      renderDefault();

      expect(screen.getByTestId('respondent-detail-skeleton')).toBeInTheDocument();
    });
  });

  describe('AC9: Back button', () => {
    it('renders back button', () => {
      renderDefault();

      expect(screen.getByTestId('back-button')).toBeInTheDocument();
    });
  });

  describe('AC10: Direction 08 styling for official route', () => {
    it('applies Direction 08 dark header on official route', () => {
      renderWithRoute(
        '/dashboard/official/respondent/:respondentId',
        '/dashboard/official/respondent/018e5f2a-1234-7890-abcd-111111111111',
      );

      // Official route should show the dark header with the respondent name
      expect(screen.getAllByText('Adewale Johnson').length).toBeGreaterThanOrEqual(1);
      // Direction 08 section headers with uppercase tracking
      expect(screen.getByText('Personal Information')).toBeInTheDocument();
    });

    it('does not apply Direction 08 on assessor route', () => {
      renderWithRoute(
        '/dashboard/assessor/respondent/:respondentId',
        '/dashboard/assessor/respondent/018e5f2a-1234-7890-abcd-111111111111',
      );

      // Regular heading style
      expect(screen.getAllByText('Adewale Johnson').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Fraud summary card', () => {
    it('renders fraud summary when fraud detections exist', () => {
      renderDefault();

      expect(screen.getByTestId('fraud-summary-card')).toBeInTheDocument();
      // Multiple fraud severity badges (one in summary + one per submission row)
      expect(screen.getAllByTestId('fraud-severity-badge').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render fraud summary when no fraud data', () => {
      mockDetailReturn = {
        data: { ...fullPiiDetail, fraudSummary: null },
        isLoading: false,
        isError: false,
      };

      renderDefault();

      expect(screen.queryByTestId('fraud-summary-card')).not.toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('renders error state when request fails', () => {
      mockDetailReturn = { data: undefined, isLoading: false, isError: true };

      renderDefault();

      expect(screen.getByText('Failed to load respondent details')).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
/**
 * SupervisorFraudPage Tests
 *
 * Story 4.4 AC4.4.1/AC4.4.2/AC4.4.7: Fraud detection list with filters, badges, states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockUseFraudDetections, mockUseFraudDetectionDetail, mockReviewMutate } = vi.hoisted(() => ({
  mockUseFraudDetections: vi.fn(),
  mockUseFraudDetectionDetail: vi.fn(),
  mockReviewMutate: vi.fn(),
}));

vi.mock('../../hooks/useFraudDetections', () => ({
  useFraudDetections: (...args: unknown[]) => mockUseFraudDetections(...args),
  useFraudDetectionDetail: (...args: unknown[]) => mockUseFraudDetectionDetail(...args),
  useReviewFraudDetection: () => ({
    mutate: mockReviewMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
  }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonTable: ({ rows, columns }: { rows: number; columns: number }) => (
    <div aria-label="Loading fraud detections" data-testid="skeleton-table" data-rows={rows} data-columns={columns} />
  ),
  SkeletonCard: ({ showHeader }: { showHeader?: boolean }) => (
    <div data-testid="skeleton-card" data-show-header={showHeader} />
  ),
}));

vi.mock('../../../../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/GpsClusterMap', () => ({
  GpsClusterMap: () => <div data-testid="gps-cluster-map" />,
}));

import SupervisorFraudPage from '../SupervisorFraudPage';

// ── Sample data ────────────────────────────────────────────────────────────

const sampleDetection = {
  id: 'det-1',
  submissionId: 'sub-1',
  enumeratorId: 'enum-1',
  computedAt: '2026-02-20T10:00:00Z',
  totalScore: 55.5,
  severity: 'high',
  resolution: null,
  resolutionNotes: null,
  reviewedAt: null,
  reviewedBy: null,
  enumeratorName: 'Adewale Johnson',
  submittedAt: '2026-02-20T09:00:00Z',
};

const sampleDetectionDetail = {
  ...sampleDetection,
  configSnapshotVersion: 1,
  gpsScore: 15,
  speedScore: 20,
  straightlineScore: 10,
  duplicateScore: 5,
  timingScore: 5.5,
  gpsDetails: null,
  speedDetails: null,
  straightlineDetails: null,
  duplicateDetails: null,
  timingDetails: null,
  gpsLatitude: null,
  gpsLongitude: null,
  enumeratorLgaId: 'lga-ib-north',
  formName: 'OSLSR Survey',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<SupervisorFraudPage />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFraudDetections.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
  mockUseFraudDetectionDetail.mockReturnValue({
    data: undefined,
    isLoading: false,
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SupervisorFraudPage', () => {
  describe('AC4.4.7: Page header and structure', () => {
    it('renders page heading', () => {
      renderPage();
      expect(screen.getByText('Fraud Alerts')).toBeInTheDocument();
      expect(screen.getByText('Review flagged submissions and suspicious activity')).toBeInTheDocument();
    });

    it('renders severity filter buttons', () => {
      renderPage();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('renders resolution status filter buttons', () => {
      renderPage();
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Unreviewed')).toBeInTheDocument();
      expect(screen.getByText('Reviewed')).toBeInTheDocument();
    });
  });

  describe('AC4.4.7: Loading state', () => {
    it('renders skeleton table when loading', () => {
      mockUseFraudDetections.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });
      renderPage();
      expect(screen.getByTestId('skeleton-table')).toBeInTheDocument();
    });
  });

  describe('AC4.4.7: Error state', () => {
    it('renders error message on failure', () => {
      mockUseFraudDetections.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });
      renderPage();
      expect(screen.getByText('Failed to load fraud detections')).toBeInTheDocument();
    });
  });

  describe('AC4.4.7: Empty state', () => {
    it('renders empty message when no detections', () => {
      mockUseFraudDetections.mockReturnValue({
        data: { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 },
        isLoading: false,
        isError: false,
      });
      renderPage();
      expect(screen.getByText('No flagged submissions')).toBeInTheDocument();
    });
  });

  describe('AC4.4.1: Detection list rendering', () => {
    it('renders detection table with enumerator name and severity badge', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      });
      renderPage();
      expect(screen.getByText('Adewale Johnson')).toBeInTheDocument();
      // "High" appears both in filter chip and severity badge — verify at least 2
      const highElements = screen.getAllByText('High');
      expect(highElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('55.5')).toBeInTheDocument();
      // "Unreviewed" appears in filter chip and resolution badge — verify at least 2
      const unreviewedElements = screen.getAllByText('Unreviewed');
      expect(unreviewedElements.length).toBeGreaterThanOrEqual(2);
    });

    it('displays total count badge', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 3,
        },
        isLoading: false,
        isError: false,
      });
      renderPage();
      expect(screen.getByText('3 total')).toBeInTheDocument();
    });

    it('renders Evidence button for each detection', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      });
      renderPage();
      expect(screen.getByLabelText('View evidence for Adewale Johnson')).toBeInTheDocument();
    });
  });

  describe('AC4.4.2: Pagination', () => {
    it('renders pagination controls', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 3,
          totalItems: 50,
        },
        isLoading: false,
        isError: false,
      });
      renderPage();
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('disables Previous on first page', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 3,
          totalItems: 50,
        },
        isLoading: false,
        isError: false,
      });
      renderPage();
      const prevButton = screen.getByText('Previous').closest('button');
      expect(prevButton).toBeDisabled();
    });
  });

  describe('AC4.4.2: Filter behavior', () => {
    it('calls useFraudDetections with updated severity filter on click', () => {
      renderPage();
      fireEvent.click(screen.getByText('High'));
      // After clicking High, the hook should be called with severity filter including 'high'
      expect(mockUseFraudDetections).toHaveBeenCalledWith(
        expect.objectContaining({ severity: ['high'] }),
      );
    });

    it('calls useFraudDetections with reviewed=undefined for "All" filter', () => {
      renderPage();
      fireEvent.click(screen.getByText('All'));
      expect(mockUseFraudDetections).toHaveBeenCalledWith(
        expect.objectContaining({ reviewed: undefined }),
      );
    });
  });

  describe('AC4.4.3: Evidence panel', () => {
    it('opens evidence panel when row is clicked', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      });
      mockUseFraudDetectionDetail.mockReturnValue({
        data: sampleDetectionDetail,
        isLoading: false,
      });
      renderPage();

      // Click on the evidence button
      fireEvent.click(screen.getByLabelText('View evidence for Adewale Johnson'));

      // Evidence panel should show detail
      expect(screen.getByText('GPS Analysis')).toBeInTheDocument();
      expect(screen.getByText('Speed Analysis')).toBeInTheDocument();
      expect(screen.getByText('Review This Detection')).toBeInTheDocument();
    });

    it('shows loading skeleton while detail is loading (H2 fix)', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      });
      mockUseFraudDetectionDetail.mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      renderPage();

      fireEvent.click(screen.getByLabelText('View evidence for Adewale Johnson'));

      // Should show skeleton cards while loading
      const skeletonCards = screen.getAllByTestId('skeleton-card');
      expect(skeletonCards.length).toBeGreaterThan(0);
    });
  });

  describe('AC4.4.7: Keyboard navigation', () => {
    it('opens evidence panel when Enter is pressed on a row', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      });
      mockUseFraudDetectionDetail.mockReturnValue({
        data: sampleDetectionDetail,
        isLoading: false,
      });
      renderPage();

      // Find the row and press Enter
      const row = screen.getByText('Adewale Johnson').closest('tr')!;
      fireEvent.keyDown(row, { key: 'Enter' });

      // Evidence panel should appear
      expect(screen.getByText('GPS Analysis')).toBeInTheDocument();
    });

    it('closes evidence panel when Escape is pressed (H1 fix)', () => {
      mockUseFraudDetections.mockReturnValue({
        data: {
          data: [sampleDetection],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      });
      mockUseFraudDetectionDetail.mockReturnValue({
        data: sampleDetectionDetail,
        isLoading: false,
      });
      renderPage();

      // Open evidence panel
      fireEvent.click(screen.getByLabelText('View evidence for Adewale Johnson'));
      expect(screen.getByText('GPS Analysis')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Evidence panel should close — GPS Analysis only appears in the panel
      expect(screen.queryByText('GPS Analysis')).not.toBeInTheDocument();
    });
  });
});

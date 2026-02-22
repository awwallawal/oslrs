// @vitest-environment jsdom
/**
 * Assessor Sub-Pages Tests
 *
 * Story 2.5-7 AC9: Lazy-loaded sub-pages render correctly.
 * Tests AssessorQueuePage, AssessorCompletedPage, AssessorEvidencePage.
 * Story 5.2: Queue and Completed pages now use hooks — mocked here.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// Mock hooks used by AssessorQueuePage
vi.mock('../../hooks/useAssessor', () => ({
  useAuditQueue: () => ({
    data: { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 },
    isLoading: false,
    isError: false,
  }),
  useQueueStats: () => ({ data: undefined }),
  useCompletedReviews: () => ({
    data: { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 },
    isLoading: false,
    isError: false,
  }),
  useAssessorReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useFraudDetections', () => ({
  useFraudDetectionDetail: () => ({ data: undefined, isLoading: false }),
}));

import AssessorQueuePage from '../AssessorQueuePage';
import AssessorCompletedPage from '../AssessorCompletedPage';
import AssessorEvidencePage from '../AssessorEvidencePage';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Assessor Sub-Pages', () => {
  describe('AssessorQueuePage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('Verification Queue')).toBeInTheDocument();
    });

    it('renders empty state when no items', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('shows empty state message', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('No submissions in queue')).toBeInTheDocument();
    });
  });

  describe('AssessorCompletedPage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByText('Completed Reviews')).toBeInTheDocument();
    });

    it('renders empty state when no items', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('shows empty state message', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByText('No completed reviews')).toBeInTheDocument();
    });
  });

  describe('AssessorEvidencePage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><AssessorEvidencePage /></MemoryRouter>);
      expect(screen.getByText('Evidence Panel')).toBeInTheDocument();
    });

    it('renders empty state copy', () => {
      render(<MemoryRouter><AssessorEvidencePage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    });

    it('shows Epic 5 message', () => {
      render(<MemoryRouter><AssessorEvidencePage /></MemoryRouter>);
      expect(screen.getByText('Evidence panel will be available in Epic 5.')).toBeInTheDocument();
    });
  });
});

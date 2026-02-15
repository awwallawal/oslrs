// @vitest-environment jsdom
/**
 * Assessor Sub-Pages Tests
 *
 * Story 2.5-7 AC9: Lazy-loaded sub-pages with empty state patterns.
 * Tests AssessorQueuePage, AssessorCompletedPage, AssessorEvidencePage.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import AssessorQueuePage from '../AssessorQueuePage';
import AssessorCompletedPage from '../AssessorCompletedPage';
import AssessorEvidencePage from '../AssessorEvidencePage';

afterEach(() => {
  cleanup();
});

describe('Assessor Sub-Pages', () => {
  describe('AssessorQueuePage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('Verification Queue')).toBeInTheDocument();
    });

    it('renders empty state copy', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    });

    it('shows Epic 5 message', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('Verification queue will be available in Epic 5.')).toBeInTheDocument();
    });
  });

  describe('AssessorCompletedPage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByText('Completed Reviews')).toBeInTheDocument();
    });

    it('renders empty state copy', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    });

    it('shows placeholder message', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByText('Completed reviews will appear here.')).toBeInTheDocument();
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

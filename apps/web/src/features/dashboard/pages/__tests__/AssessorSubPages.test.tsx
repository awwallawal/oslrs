// @vitest-environment jsdom
/**
 * Assessor Sub-Pages Tests
 *
 * Story 2.5-7 AC9: Lazy-loaded sub-pages with empty state patterns.
 * Tests AssessorQueuePage, AssessorCompletedPage, AssessorEvidencePage.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import AssessorQueuePage from '../AssessorQueuePage';
import AssessorCompletedPage from '../AssessorCompletedPage';
import AssessorEvidencePage from '../AssessorEvidencePage';

describe('Assessor Sub-Pages', () => {
  describe('AssessorQueuePage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('Verification Queue')).toBeInTheDocument();
    });

    it('renders empty state with correct icon', () => {
      render(<MemoryRouter><AssessorQueuePage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
      expect(document.querySelector('.lucide-file-search')).toBeInTheDocument();
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

    it('renders empty state with correct icon', () => {
      render(<MemoryRouter><AssessorCompletedPage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
      expect(document.querySelector('.lucide-circle-check-big')).toBeInTheDocument();
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

    it('renders empty state with correct icon', () => {
      render(<MemoryRouter><AssessorEvidencePage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
      expect(document.querySelector('.lucide-shield')).toBeInTheDocument();
    });

    it('shows Epic 5 message', () => {
      render(<MemoryRouter><AssessorEvidencePage /></MemoryRouter>);
      expect(screen.getByText('Evidence panel will be available in Epic 5.')).toBeInTheDocument();
    });
  });
});

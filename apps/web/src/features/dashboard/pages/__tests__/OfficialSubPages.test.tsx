// @vitest-environment jsdom
/**
 * Official Sub-Pages Tests
 *
 * Story 2.5-7 AC9: Lazy-loaded sub-pages with empty state patterns.
 * Tests OfficialStatsPage, OfficialTrendsPage, OfficialExportPage.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import OfficialStatsPage from '../OfficialStatsPage';
import OfficialTrendsPage from '../OfficialTrendsPage';
import OfficialExportPage from '../OfficialExportPage';

describe('Official Sub-Pages', () => {
  describe('OfficialStatsPage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
      expect(screen.getByText('Statistics')).toBeInTheDocument();
    });

    it('renders empty state with correct icon', () => {
      render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
      expect(document.querySelector('.lucide-pie-chart')).toBeInTheDocument();
    });

    it('shows Epic 5 message', () => {
      render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
      expect(screen.getByText('Statistics will be available in Epic 5.')).toBeInTheDocument();
    });
  });

  describe('OfficialTrendsPage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
      expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
    });

    it('renders empty state with correct icon', () => {
      render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
      expect(document.querySelector('.lucide-trending-up')).toBeInTheDocument();
    });

    it('shows Epic 5 message', () => {
      render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
      expect(screen.getByText('Trend analysis will be available in Epic 5.')).toBeInTheDocument();
    });
  });

  describe('OfficialExportPage', () => {
    it('renders page title', () => {
      render(<MemoryRouter><OfficialExportPage /></MemoryRouter>);
      expect(screen.getByText('Export Reports')).toBeInTheDocument();
    });

    it('renders empty state with correct icon', () => {
      render(<MemoryRouter><OfficialExportPage /></MemoryRouter>);
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
      expect(document.querySelector('.lucide-download')).toBeInTheDocument();
    });

    it('shows Epic 5 message', () => {
      render(<MemoryRouter><OfficialExportPage /></MemoryRouter>);
      expect(screen.getByText('Export functionality will be available in Epic 5.')).toBeInTheDocument();
    });
  });
});

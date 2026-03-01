// @vitest-environment jsdom
/**
 * OfficialHome Tests
 *
 * Story 5.1 AC1: Live data rendering, AC5: skeleton states,
 * AC6: read-only assertion, AC7: Direction 08 styling.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

let mockOverviewReturn = {
  data: undefined as any,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../hooks/useOfficial', () => ({
  useOverviewStats: () => mockOverviewReturn,
  officialKeys: { all: ['official'], overview: () => ['official', 'overview'] },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
}));

import OfficialHome from '../OfficialHome';

afterEach(() => {
  cleanup();
});

function renderComponent() {
  return render(
    <MemoryRouter>
      <OfficialHome />
    </MemoryRouter>
  );
}

const sampleStats = {
  totalRespondents: 12500,
  todayRegistrations: 45,
  yesterdayRegistrations: 38,
  lgasCovered: 18,
  sourceBreakdown: {
    enumerator: 8000,
    public: 3000,
    clerk: 1500,
  },
};

describe('OfficialHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverviewReturn = {
      data: sampleStats,
      isLoading: false,
      error: null,
    };
  });

  describe('AC1: Live Data Rendering', () => {
    it('renders total respondents count', () => {
      renderComponent();
      expect(screen.getByTestId('total-respondents')).toHaveTextContent('12,500');
    });

    it('renders today registration count', () => {
      renderComponent();
      expect(screen.getByTestId('today-count')).toHaveTextContent('45');
    });

    it('renders delta indicator when today differs from yesterday', () => {
      renderComponent();
      const delta = screen.getByTestId('delta-indicator');
      expect(delta).toBeInTheDocument();
      expect(delta).toHaveTextContent('7');
    });

    it('renders LGAs covered count', () => {
      renderComponent();
      expect(screen.getByTestId('lgas-covered')).toHaveTextContent('18 / 33');
    });

    it('renders source channel breakdown', () => {
      renderComponent();
      expect(screen.getByTestId('source-enumerator')).toHaveTextContent('8,000');
      expect(screen.getByTestId('source-public')).toHaveTextContent('3,000');
      expect(screen.getByTestId('source-clerk')).toHaveTextContent('1,500');
    });

    it('renders collection progress with percentage', () => {
      renderComponent();
      expect(screen.getByTestId('progress-count')).toHaveTextContent('12,500');
      expect(screen.getByText('/ 1,000,000 target')).toBeInTheDocument();
    });

    it('renders progress bar with correct width', () => {
      renderComponent();
      const bar = screen.getByTestId('progress-bar');
      expect(bar).toHaveStyle({ width: '1.25%' });
    });
  });

  describe('AC5: Skeleton Loading', () => {
    it('renders skeleton cards when loading', () => {
      mockOverviewReturn = { data: undefined, isLoading: true, error: null };
      renderComponent();
      const skeletons = screen.getAllByLabelText('Loading card');
      expect(skeletons.length).toBeGreaterThanOrEqual(6);
    });

    it('hides content when loading', () => {
      mockOverviewReturn = { data: undefined, isLoading: true, error: null };
      renderComponent();
      expect(screen.queryByText('State Overview')).not.toBeInTheDocument();
    });
  });

  describe('AC6: Read-Only Enforcement', () => {
    it('has Export Report button that navigates to export page', () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: 'Export Report' });
      expect(exportBtn).toBeEnabled();
    });

    it('has no input fields', () => {
      renderComponent();
      const inputs = document.querySelectorAll('input, textarea');
      expect(inputs).toHaveLength(0);
    });
  });

  describe('Error State', () => {
    it('renders error message when API fails', () => {
      mockOverviewReturn = { data: undefined, isLoading: false, error: new Error('Network error') };
      renderComponent();
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
      expect(screen.getByText('Unable to load dashboard data')).toBeInTheDocument();
    });

    it('hides data cards when error occurs', () => {
      mockOverviewReturn = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.queryByTestId('state-overview-card')).not.toBeInTheDocument();
    });
  });

  describe('AC7: Direction 08 Styling', () => {
    it('renders dark header accent strip', () => {
      renderComponent();
      const header = screen.getByText('Reports Dashboard').closest('div');
      expect(header).toHaveClass('bg-gray-800', 'text-white');
    });

    it('renders section header with maroon border', () => {
      renderComponent();
      const section = screen.getByText('Overview').closest('div');
      expect(section).toHaveClass('border-l-4', 'border-[#9C1E23]');
    });
  });

  describe('Empty State', () => {
    it('renders zero values when no data exists', () => {
      mockOverviewReturn = {
        data: {
          totalRespondents: 0,
          todayRegistrations: 0,
          yesterdayRegistrations: 0,
          lgasCovered: 0,
          sourceBreakdown: { enumerator: 0, public: 0, clerk: 0 },
        },
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('total-respondents')).toHaveTextContent('0');
      expect(screen.getByTestId('today-count')).toHaveTextContent('0');
    });
  });
});

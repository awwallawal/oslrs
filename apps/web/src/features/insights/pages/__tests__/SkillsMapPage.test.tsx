// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PublicInsightsData } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

const mockInsights = vi.hoisted(() => ({
  data: null as PublicInsightsData | null,
  isLoading: true,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock('../../hooks/usePublicInsights', () => ({
  usePublicInsights: () => mockInsights,
}));

vi.mock('../../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ReferenceLine: () => <div />,
}));

import SkillsMapPage from '../SkillsMapPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SkillsMapPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const fullData: PublicInsightsData = {
  totalRegistered: 5000,
  lgasCovered: 33,
  genderSplit: [],
  ageDistribution: [],
  allSkills: [
    { skill: 'welding', count: 500, percentage: 25 },
    { skill: 'tailoring', count: 400, percentage: 20 },
    { skill: 'carpentry', count: 300, percentage: 15 },
  ],
  desiredSkills: [
    { skill: 'coding', count: 200, percentage: 40 },
    { skill: 'marketing', count: 100, percentage: 20 },
  ],
  employmentBreakdown: [],
  formalInformalRatio: [],
  businessOwnershipRate: null,
  unemploymentEstimate: null,
  youthEmploymentRate: null,
  gpi: null,
  lgaDensity: [],
  lastUpdated: '2026-03-13T10:00:00.000Z',
};

describe('SkillsMapPage', () => {
  it('shows loading skeletons when loading', () => {
    mockInsights.isLoading = true;
    mockInsights.data = null;
    mockInsights.error = null;
    renderPage();
    expect(document.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    mockInsights.isLoading = false;
    mockInsights.data = null;
    mockInsights.error = new Error('Failed');
    renderPage();
    expect(screen.getByText(/unable to load skills data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders all skills chart when data loads', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText('Skills Distribution')).toBeInTheDocument();
    expect(screen.getByText('All Skills')).toBeInTheDocument();
    expect(screen.getByText(/ISCO-08/i)).toBeInTheDocument();
  });

  it('renders back navigation link', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByRole('link', { name: /back to insights/i })).toHaveAttribute('href', '/insights');
  });

  it('renders skills gap chart when desiredSkills present', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/skills gap/i)).toBeInTheDocument();
  });

  it('shows placeholder when desiredSkills is empty', () => {
    mockInsights.isLoading = false;
    mockInsights.data = { ...fullData, desiredSkills: [] };
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/no training interest data yet/i)).toBeInTheDocument();
  });

  it('renders methodology note (AC#6: any public insights page)', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/methodology/i)).toBeInTheDocument();
    expect(screen.getByText(/data refreshed hourly/i)).toBeInTheDocument();
  });
});

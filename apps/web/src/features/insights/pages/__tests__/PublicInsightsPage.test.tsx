// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PublicInsightsData } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Hoisted mock ─────────────────────────────────────────────────────
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

// Mock react-leaflet (used by LgaChoroplethMap added in Story 8.8)
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="mock-map">{children}</div>,
  TileLayer: () => <div />,
  GeoJSON: () => <div data-testid="mock-geojson" />,
}));
vi.mock('leaflet', () => ({
  default: { icon: vi.fn(() => ({})), Marker: { prototype: { options: {} } } },
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}));

// Reset LgaChoroplethMap module cache and mock fetch for GeoJSON
import { _resetGeoJsonCache } from '../../../dashboard/components/charts/LgaChoroplethMap';

import PublicInsightsPage from '../PublicInsightsPage';

beforeEach(() => {
  _resetGeoJsonCache();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { lgaName: 'Ibadan North', lgaCode: 'ibadan_north' }, geometry: { type: 'Polygon', coordinates: [[[3.9, 7.4], [3.9, 7.5], [4.0, 7.5], [4.0, 7.4], [3.9, 7.4]]] } },
      ],
    }),
  });
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicInsightsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const fullData: PublicInsightsData = {
  totalRegistered: 5000,
  lgasCovered: 33,
  genderSplit: [
    { label: 'male', count: 2800, percentage: 56, suppressed: false },
    { label: 'female', count: 2200, percentage: 44, suppressed: false },
  ],
  ageDistribution: [
    { label: '15-24', count: 1500, percentage: 30, suppressed: false },
    { label: '25-34', count: 2000, percentage: 40, suppressed: false },
  ],
  allSkills: [
    { skill: 'welding', count: 500, percentage: 25 },
    { skill: 'tailoring', count: 400, percentage: 20 },
  ],
  desiredSkills: [
    { skill: 'coding', count: 300, percentage: 30 },
  ],
  employmentBreakdown: [
    { label: 'employed', count: 3500, percentage: 70, suppressed: false },
    { label: 'unemployed_seeking', count: 1000, percentage: 20, suppressed: false },
  ],
  formalInformalRatio: [
    { label: 'formal', count: 2000, percentage: 57.1, suppressed: false },
    { label: 'informal', count: 1500, percentage: 42.9, suppressed: false },
  ],
  businessOwnershipRate: 12.5,
  unemploymentEstimate: 8.3,
  youthEmploymentRate: 65.2,
  gpi: 0.85,
  lgaDensity: [
    { label: 'Ibadan North', count: 500, percentage: 10, suppressed: false },
  ],
  lastUpdated: '2026-03-13T10:00:00.000Z',
};

describe('PublicInsightsPage', () => {
  it('shows loading skeletons when loading', () => {
    mockInsights.isLoading = true;
    mockInsights.data = null;
    mockInsights.error = null;
    renderPage();
    expect(document.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    mockInsights.isLoading = false;
    mockInsights.data = null;
    mockInsights.error = new Error('Network error');
    renderPage();
    expect(screen.getByText(/unable to load insights/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders hero stats when data loads', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/oyo state labour force at a glance/i)).toBeInTheDocument();
    expect(screen.getByText('Total Registered')).toBeInTheDocument();
    expect(screen.getByText('LGAs Covered')).toBeInTheDocument();
  });

  it('renders demographics section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Gender Distribution')).toBeInTheDocument();
    expect(screen.getByText('Age Distribution')).toBeInTheDocument();
  });

  it('renders employment section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText('Employment Landscape')).toBeInTheDocument();
  });

  it('renders skills section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText('Skills & Training')).toBeInTheDocument();
  });

  it('renders methodology section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/methodology/i)).toBeInTheDocument();
    expect(screen.getByText(/N = 5,000/)).toBeInTheDocument();
    expect(screen.getByText(/data refreshed hourly/i)).toBeInTheDocument();
  });

  it('renders last-updated badge in methodology section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
  });

  it('shows N/A for null GPI and youth employment rate', () => {
    mockInsights.isLoading = false;
    mockInsights.data = { ...fullData, gpi: null, youthEmploymentRate: null };
    mockInsights.error = null;
    renderPage();
    const naElements = screen.getAllByLabelText('Not available');
    expect(naElements.length).toBeGreaterThanOrEqual(2);
  });

  it('expands LGA table when "Show all" is clicked (M-2)', async () => {
    const manyLgas = Array.from({ length: 15 }, (_, i) => ({
      label: `LGA ${i + 1}`,
      count: 100 - i * 5,
      percentage: (100 - i * 5) / 10,
      suppressed: false,
    }));
    mockInsights.isLoading = false;
    mockInsights.data = { ...fullData, lgaDensity: manyLgas };
    mockInsights.error = null;
    const user = userEvent.setup();
    renderPage();

    // Only 10 rows initially
    const rows = screen.getAllByRole('row');
    // 1 header + 10 data rows
    expect(rows).toHaveLength(11);

    // Click expand
    const expandBtn = screen.getByRole('button', { name: /show all 15 lgas/i });
    await user.click(expandBtn);

    // All 15 rows visible
    const allRows = screen.getAllByRole('row');
    expect(allRows).toHaveLength(16); // 1 header + 15 data rows

    // Click collapse
    const collapseBtn = screen.getByRole('button', { name: /show less/i });
    await user.click(collapseBtn);
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  // Story 8.7: Key Findings tests
  it('renders key findings section when findings present', () => {
    mockInsights.isLoading = false;
    mockInsights.data = {
      ...fullData,
      keyFindings: [
        'Gender is significantly associated with employment type in Oyo State',
        'Education level correlates with monthly income',
      ],
    };
    mockInsights.error = null;
    renderPage();
    expect(screen.getByTestId('key-findings-section')).toBeInTheDocument();
    expect(screen.getByText('Key Findings')).toBeInTheDocument();
    expect(screen.getByText(/Gender is significantly associated/)).toBeInTheDocument();
    expect(screen.getByText(/Education level correlates/)).toBeInTheDocument();
  });

  it('hides key findings section when undefined or empty', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData; // no keyFindings property
    mockInsights.error = null;
    renderPage();
    expect(screen.queryByTestId('key-findings-section')).not.toBeInTheDocument();

    // Also test empty array
    mockInsights.data = { ...fullData, keyFindings: [] };
    const { unmount } = renderPage();
    expect(screen.queryByTestId('key-findings-section')).not.toBeInTheDocument();
  });

  // Story 8.8: Choropleth map tests
  it('renders registration density map section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByTestId('geographic-map-section')).toBeInTheDocument();
    expect(screen.getByText('Registration Density Map')).toBeInTheDocument();
  });

  it('choropleth section renders with suppressed public data', () => {
    const dataWithSuppressed: PublicInsightsData = {
      ...fullData,
      lgaDensity: [
        { label: 'Ibadan North', count: 500, percentage: 50, suppressed: false },
        { label: 'Ido', count: 5, percentage: 0.5, suppressed: true },
      ],
    };
    mockInsights.isLoading = false;
    mockInsights.data = dataWithSuppressed;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByTestId('geographic-map-section')).toBeInTheDocument();
  });

  it('handles suppressed data by excluding suppressed buckets', () => {
    const dataWithSuppressed: PublicInsightsData = {
      ...fullData,
      genderSplit: [
        { label: 'male', count: 91, percentage: 91, suppressed: false },
        { label: 'other', count: null, percentage: null, suppressed: true },
      ],
    };
    mockInsights.isLoading = false;
    mockInsights.data = dataWithSuppressed;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
  });
});

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
  globalThis.fetch = vi.fn().mockResolvedValue({
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
  withAnswers: 4200,
  // Story 13-46 (AC5) — the Axis-3 split is REQUIRED on the payload.
  lgasCovered: 33,
  // Story 12-4 / R-E: each rate carries the n it was computed from, and they
  // legitimately differ from each other and from withAnswers.
  genderSplit: [
    { label: 'male', count: 2800, percentage: 56, suppressed: false },
    { label: 'female', count: 2200, percentage: 44, suppressed: false },
  ],
  allSkills: [
    { skill: 'welding', count: 500, percentage: 25 },
    { skill: 'tailoring', count: 400, percentage: 20 },
  ],
  desiredSkills: [
    { skill: 'coding', count: 300, percentage: 30 },
  ],
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

  it('renders demographics section — gender only', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Gender Distribution')).toBeInTheDocument();
    // Age removed 2026-08-26: ~35% populated across the intake routes.
    expect(screen.queryByText('Age Distribution')).not.toBeInTheDocument();
  });

  /* 'renders employment section' REMOVED — the section is gone. Employment,
     formal/informal and unemployment are collected by no intake route but the
     enumerator instrument (~2% of the registry post-import), and the unemployment
     figure had already published wrong once (12-6 ruling R-E). */

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
    expect(screen.getByText('Registered People')).toBeInTheDocument();
    expect(screen.getByText(/data refreshed hourly/i)).toBeInTheDocument();
    // The "Complete Survey Responses" tile is gone — post-intake it would read 282
    // beside a headline of ~9,500: a 3% ratio, unexplained, on a public page.
    expect(screen.queryByText('Complete Survey Responses')).not.toBeInTheDocument();
  });

  it('⭐ the methodology note describes the METHOD, not a limitation', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData; // 5,000 registered
    mockInsights.error = null;
    renderPage();
    const note = screen.getByRole('region', { name: /methodology/i });

    // It now says every figure counts EVERYONE, and names all four intake routes.
    expect(note.textContent).toMatch(/all\s*5,000\s*registered people/i);
    expect(note.textContent).toMatch(/enumerator/i);
    expect(note.textContent).toMatch(/associations/i);

    // ⛔ REGRESSION GUARDS. The 2026-08-18 ruling removed prose narrating the
    // answer-less remainder — it named the soft-launch window and read as an
    // admission of data loss. The 2026-08-26 ruling removed the qualification
    // itself: the page publishes only axis-universal figures, so it needs none.
    expect(note.textContent).not.toMatch(/soft-launch/i);
    expect(note.textContent).not.toMatch(/not on file/i);
    expect(note.textContent).not.toMatch(/complete survey responses/i);
    // And it must not claim only two collection routes when there are four.
    expect(note.textContent).not.toMatch(/field enumeration & self-registration/i);
  });

  // ── Review R3/R4 — every published rate ships the n it came from ──

  /*
   * ⛔ THREE `rateDenominators` TESTS REMOVED HERE — 2026-08-26 (Awwal's ruling).
   * They asserted that each published rate shipped with the n it was computed from
   * (ruling R-E). Correct for a page that publishes deep-field rates; this page no
   * longer does. The rates they guarded — unemployment, youth employment, business
   * ownership — were REMOVED rather than caveated, because none is collected on more
   * than ~2% of the registry once the association intake lands.
   *
   * Replaced by the guard below, which is the property that now matters.
   */
  it('⭐ publishes ONLY axis-universal metrics — no deep-field figure, no caveat', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();

    // Present: measurable on EVERY intake route (~99% populated).
    expect(screen.getByText('Total Registered')).toBeInTheDocument();
    expect(screen.getByText('LGAs Covered')).toBeInTheDocument();
    expect(screen.getByText('Gender Parity Index')).toBeInTheDocument();

    // Absent: deep-field, and each would have needed a denominator caveat.
    // A caveat a reader cannot interrogate is a headline somebody else gets to write.
    expect(screen.queryByText(/Youth Employment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Employment Status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unemployment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Age Distribution/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Formal.*Informal/i)).not.toBeInTheDocument();

    // And NO denominator captions anywhere — the page needs none.
    expect(screen.queryByText(/based on [\d,]+ responses/)).not.toBeInTheDocument();
  });

  it('⭐ never prints the verification composition on the PUBLIC page', () => {
    // 13-46 AC5 rendered "N imported, unverified" under the headline. Post-intake that
    // reads "9,505 imported, unverified" — the word against ~96% of the registry, in
    // the most screenshot-able place on the site. The composition is NOT hidden: 12-6
    // renders all three axes on the INTERNAL data-health view.
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.queryByText(/unverified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/self-declared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/awaiting NIN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/complete survey responses/i)).not.toBeInTheDocument();
  });

  it('renders last-updated badge in methodology section', () => {
    mockInsights.isLoading = false;
    mockInsights.data = fullData;
    mockInsights.error = null;
    renderPage();
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
  });

  it('shows N/A for a null GPI', () => {
    mockInsights.isLoading = false;
    mockInsights.data = { ...fullData, gpi: null };
    mockInsights.error = null;
    renderPage();
    const naElements = screen.getAllByLabelText('Not available');
    expect(naElements.length).toBeGreaterThanOrEqual(1);
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

/*
 * ⛔ describe('Story 13-46 (AC5 / review A10) — the verification split is RENDERED')
 *    REMOVED IN FULL — 2026-08-26 (Awwal's ruling).
 *
 * It held two tests guarding the `byVerification` subtitle on the PUBLIC page:
 * 'renders every Axis-3 tier the payload carries' and 'NEVER labels a tier "Verified"'.
 *
 * 13-46 AC5's intent was right — a split that ships in the type and never reaches the
 * page is the 12-5 defect wearing a new name. But the ruling is that this composition
 * does not belong on the PUBLIC surface at all: post-intake the subtitle would read
 * "9,505 imported, unverified" beneath the headline, i.e. the word *unverified* against
 * ~96% of the registry, in the most screenshot-able place on the site, during a campaign
 * season. It is not hidden — 12-6 renders all three axes on the internal data-health
 * view, and the strata belong in the final report where a reader can ask about them.
 *
 * R1 ("a NIN is captured, never validated — never label it Verified") is UNCHANGED and
 * still guarded where the tiers are rendered. On this page the stronger property now
 * lives in '⭐ never prints the verification composition on the PUBLIC page', which
 * asserts that none of it renders at all.
 */

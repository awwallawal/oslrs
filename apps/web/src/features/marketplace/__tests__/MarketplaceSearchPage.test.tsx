// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

expect.extend(matchers);

// ── Mock state ──────────────────────────────────────────────────────────────

let mockSearchReturn: {
  data: any;
  isLoading: boolean;
  isFetching: boolean;
};

let mockLgasReturn: {
  data: any[];
};

// ── Mock modules ────────────────────────────────────────────────────────────

vi.mock('../hooks/useMarketplace', () => ({
  useMarketplaceSearch: () => mockSearchReturn,
  marketplaceKeys: { all: ['marketplace'], search: (p: any) => ['marketplace', 'search', p] },
}));

vi.mock('../../dashboard/api/export.api', () => ({
  fetchLgas: () =>
    Promise.resolve(mockLgasReturn.data),
}));

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Search: () => <svg data-testid="search-icon" />,
    SearchX: () => <svg data-testid="search-x-icon" />,
    MapPin: () => <svg data-testid="map-pin-icon" />,
    Briefcase: () => <svg data-testid="briefcase-icon" />,
    CheckCircle: () => <svg data-testid="check-circle-icon" />,
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const sampleProfile = {
  id: '018e1234-5678-7000-8000-000000000001',
  profession: 'Electrician',
  lgaName: 'Ibadan North',
  experienceLevel: '5-10 years',
  verifiedBadge: true,
  bio: 'Experienced electrician specializing in residential wiring and industrial setups.',
  relevanceScore: 0.0607,
};

const sampleProfile2 = {
  id: '018e1234-5678-7000-8000-000000000002',
  profession: 'Tailor',
  lgaName: 'Ogbomoso North',
  experienceLevel: '1-3 years',
  verifiedBadge: false,
  bio: null,
  relevanceScore: 0.04,
};

const emptyPagination = {
  pageSize: 20,
  hasNextPage: false,
  hasPreviousPage: false,
  nextCursor: null,
  previousCursor: null,
  totalItems: 0,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/marketplace']}>
        <MarketplaceSearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Lazy import to allow mocks to be set up first
let MarketplaceSearchPage: any;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSearchReturn = {
    data: {
      data: [],
      meta: { pagination: emptyPagination },
    },
    isLoading: false,
    isFetching: false,
  };
  mockLgasReturn = {
    data: [
      { id: '1', name: 'Ibadan North', code: 'ibadan-north' },
      { id: '2', name: 'Ogbomoso North', code: 'ogbomoso-north' },
    ],
  };
  const mod = await import('../pages/MarketplaceSearchPage');
  MarketplaceSearchPage = mod.default;
});

afterEach(() => {
  cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MarketplaceSearchPage', () => {
  it('renders page title and subtitle', () => {
    renderPage();
    expect(screen.getByText('Skills Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Find verified skilled workers in Oyo State')).toBeInTheDocument();
  });

  it('renders search bar', () => {
    renderPage();
    expect(screen.getByTestId('marketplace-search-input')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search skills/i)).toBeInTheDocument();
  });

  it('renders filter controls', () => {
    renderPage();
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    expect(screen.getByTestId('profession-filter')).toBeInTheDocument();
    expect(screen.getByTestId('experience-filter')).toBeInTheDocument();
  });

  it('shows loading skeleton cards when loading', () => {
    mockSearchReturn = {
      data: undefined,
      isLoading: true,
      isFetching: true,
    };
    renderPage();
    expect(screen.getByTestId('skeleton-grid')).toBeInTheDocument();
  });

  it('shows empty state when no results', () => {
    mockSearchReturn = {
      data: {
        data: [],
        meta: { pagination: emptyPagination },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText(/No workers found/i)).toBeInTheDocument();
  });

  it('renders worker cards with anonymous profile data', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile, sampleProfile2],
        meta: {
          pagination: { ...emptyPagination, totalItems: 2 },
        },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();

    expect(screen.getByTestId('results-grid')).toBeInTheDocument();
    const cards = screen.getAllByTestId('worker-card');
    expect(cards).toHaveLength(2);
  });

  it('displays profession on worker card', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByText('Electrician')).toBeInTheDocument();
  });

  it('displays LGA name on worker card', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
  });

  it('displays verified badge for verified profiles', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('does not display verified badge for unverified profiles', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile2],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it('truncates long bio text', () => {
    const longBio = 'A'.repeat(150);
    mockSearchReturn = {
      data: {
        data: [{ ...sampleProfile, bio: longBio }],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    // Bio should be truncated to ~100 chars + '...'
    expect(screen.getByText(/^A{100}\.\.\./)).toBeInTheDocument();
  });

  it('does not render any PII in worker cards', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();

    // Verify that common PII fields are not rendered
    expect(screen.queryByText(/firstName/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lastName/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/phoneNumber/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NIN/i)).not.toBeInTheDocument();
  });

  it('shows results count', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 42 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByTestId('results-count')).toHaveTextContent('42 results found');
  });

  it('shows singular "result" for single result', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByTestId('results-count')).toHaveTextContent('1 result found');
  });

  it('shows Load More button when hasNextPage is true', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: {
          pagination: {
            ...emptyPagination,
            hasNextPage: true,
            nextCursor: '0.04|018e1234-5678-7000-8000-000000000002',
            totalItems: 50,
          },
        },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByTestId('load-more')).toBeInTheDocument();
    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('does not show Load More button when hasNextPage is false', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: emptyPagination },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    expect(screen.queryByTestId('load-more')).not.toBeInTheDocument();
  });

  it('search input updates value immediately (debounce defers parent callback via internal state)', async () => {
    renderPage();
    const input = screen.getByTestId('marketplace-search-input');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'plumber' } });
    });

    // Input state updates immediately; parent onChange fires after 300ms debounce
    expect(input).toHaveValue('plumber');
  });

  it('has disabled "View Profile" button on worker cards (future Story 7-3)', () => {
    mockSearchReturn = {
      data: {
        data: [sampleProfile],
        meta: { pagination: { ...emptyPagination, totalItems: 1 } },
      },
      isLoading: false,
      isFetching: false,
    };
    renderPage();
    const viewBtn = screen.getByText('View Profile');
    expect(viewBtn).toBeDisabled();
  });
});

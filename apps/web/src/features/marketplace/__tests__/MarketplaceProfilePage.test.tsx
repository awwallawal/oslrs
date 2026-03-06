// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

expect.extend(matchers);

// ── Mock state ──────────────────────────────────────────────────────────────

let mockProfileReturn: {
  data: any;
  isLoading: boolean;
  error: any;
};

let mockAuthReturn: {
  isAuthenticated: boolean;
  user: any;
};

let mockRevealMutation: {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

// ── Mock modules ────────────────────────────────────────────────────────────

vi.mock('../hooks/useMarketplace', () => ({
  useMarketplaceProfile: () => mockProfileReturn,
  useRevealContact: () => mockRevealMutation,
  marketplaceKeys: {
    all: ['marketplace'],
    profile: (id: string) => ['marketplace', 'profile', id],
    revealedContact: (id: string) => ['marketplace', 'revealed', id],
  },
}));

vi.mock('../../auth/context/AuthContext', () => ({
  useAuth: () => mockAuthReturn,
}));

vi.mock('../../auth/components/HCaptcha', () => ({
  HCaptcha: ({ onVerify, onExpire, onError, error }: any) => (
    <div data-testid="hcaptcha-mock">
      <button data-testid="captcha-solve" onClick={() => onVerify('test-captcha-token')}>Solve</button>
      <button data-testid="captcha-expire" onClick={() => onExpire?.()}>Expire</button>
      <button data-testid="captcha-error" onClick={() => onError?.('captcha-error')}>Error</button>
      {error && <span data-testid="captcha-error-msg">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    ArrowLeft: () => <svg data-testid="arrow-left-icon" />,
    MapPin: () => <svg data-testid="map-pin-icon" />,
    Briefcase: () => <svg data-testid="briefcase-icon" />,
    Clock: () => <svg data-testid="clock-icon" />,
    ExternalLink: () => <svg data-testid="external-link-icon" />,
    LogIn: () => <svg data-testid="login-icon" />,
    Lock: () => <svg data-testid="lock-icon" />,
    BadgeCheck: () => <svg data-testid="badge-check-icon" />,
    Info: () => <svg data-testid="info-icon" />,
    CheckCircle2: () => <svg data-testid="check-circle-icon" />,
    Loader2: () => <svg data-testid="loader-icon" />,
    AlertCircle: () => <svg data-testid="alert-circle-icon" />,
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const sampleProfile = {
  id: '018e1234-5678-7000-8000-000000000001',
  profession: 'Electrician',
  lgaName: 'Ibadan North',
  experienceLevel: '5-10 years',
  verifiedBadge: true,
  bio: 'Experienced electrician specializing in residential wiring.',
  portfolioUrl: 'https://example.com/portfolio',
  createdAt: '2026-03-01T12:00:00.000Z',
};

const unverifiedProfile = {
  ...sampleProfile,
  id: '018e1234-5678-7000-8000-000000000002',
  verifiedBadge: false,
  bio: null,
  portfolioUrl: null,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

let MarketplaceProfilePage: any;

async function renderProfilePage(profileId = '018e1234-5678-7000-8000-000000000001') {
  const mod = await import('../pages/MarketplaceProfilePage');
  MarketplaceProfilePage = mod.default;

  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/marketplace/profile/${profileId}`]}>
        <Routes>
          <Route path="/marketplace/profile/:id" element={<MarketplaceProfilePage />} />
          <Route path="/marketplace" element={<div data-testid="marketplace-search" />} />
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockProfileReturn = {
    data: sampleProfile,
    isLoading: false,
    error: null,
  };
  mockAuthReturn = {
    isAuthenticated: false,
    user: null,
  };
  mockRevealMutation = {
    mutate: vi.fn(),
    isPending: false,
  };
});

afterEach(() => {
  cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MarketplaceProfilePage', () => {
  it('renders profile detail with all anonymous fields', async () => {
    await renderProfilePage();

    expect(screen.getByText('Electrician')).toBeInTheDocument();
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    expect(screen.getByText('5-10 years')).toBeInTheDocument();
    expect(screen.getByText('March 2026')).toBeInTheDocument();
  });

  it('renders Government Verified badge when verifiedBadge is true', async () => {
    await renderProfilePage();

    expect(screen.getByTestId('government-verified-badge')).toBeInTheDocument();
    expect(screen.getByText('Government Verified')).toBeInTheDocument();
  });

  it('does not render verified badge when verifiedBadge is false', async () => {
    mockProfileReturn = {
      data: unverifiedProfile,
      isLoading: false,
      error: null,
    };
    await renderProfilePage();

    expect(screen.queryByTestId('government-verified-badge')).not.toBeInTheDocument();
  });

  it('renders bio text when present', async () => {
    await renderProfilePage();

    expect(screen.getByTestId('profile-bio')).toHaveTextContent(
      'Experienced electrician specializing in residential wiring.',
    );
  });

  it('renders placeholder when bio is absent', async () => {
    mockProfileReturn = {
      data: unverifiedProfile,
      isLoading: false,
      error: null,
    };
    await renderProfilePage();

    expect(screen.getByTestId('profile-bio')).toHaveTextContent(
      "This worker hasn't added a bio yet.",
    );
  });

  it('renders portfolio URL as link when present', async () => {
    await renderProfilePage();

    const link = screen.getByTestId('portfolio-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com/portfolio');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders placeholder when portfolio URL is absent', async () => {
    mockProfileReturn = {
      data: unverifiedProfile,
      isLoading: false,
      error: null,
    };
    await renderProfilePage();

    expect(screen.getByTestId('no-portfolio')).toHaveTextContent('No portfolio link provided.');
    expect(screen.queryByTestId('portfolio-link')).not.toBeInTheDocument();
  });

  it('renders "Reveal Contact" button (placeholder state) for unauthenticated user', async () => {
    await renderProfilePage();

    const button = screen.getByTestId('reveal-contact-unauthenticated');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Sign in to Reveal Contact');
  });

  it('navigates to /login with state.from when unauthenticated user clicks Reveal Contact (AC #7)', async () => {
    await renderProfilePage();

    const button = screen.getByTestId('reveal-contact-unauthenticated');
    fireEvent.click(button);

    // Should navigate to /login route
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('renders clickable "Reveal Contact Details" for authenticated user', async () => {
    mockAuthReturn = {
      isAuthenticated: true,
      user: { id: '1', role: 'public_user' },
    };
    await renderProfilePage();

    const button = screen.getByTestId('reveal-contact-authenticated');
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Reveal Contact Details');
  });

  it('renders loading skeleton during fetch', async () => {
    mockProfileReturn = {
      data: undefined,
      isLoading: true,
      error: null,
    };
    await renderProfilePage();

    expect(screen.getByTestId('profile-skeleton')).toBeInTheDocument();
  });

  it('renders 404 error state when profile not found', async () => {
    mockProfileReturn = {
      data: null,
      isLoading: false,
      error: { message: 'Profile not found' },
    };
    await renderProfilePage();

    expect(screen.getByTestId('profile-not-found')).toBeInTheDocument();
    expect(screen.getByText('Profile not found')).toBeInTheDocument();
    expect(screen.getByText('Back to Marketplace')).toBeInTheDocument();
  });

  it('renders back button', async () => {
    await renderProfilePage();

    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.getByText('Back to Search')).toBeInTheDocument();
  });

  it('does NOT render any PII fields in output', async () => {
    await renderProfilePage();

    const pageText = document.body.textContent || '';
    expect(pageText).not.toContain('respondentId');
    expect(pageText).not.toContain('firstName');
    expect(pageText).not.toContain('lastName');
    expect(pageText).not.toContain('phoneNumber');
    expect(pageText).not.toContain('dateOfBirth');
    expect(pageText).not.toContain('editToken');
    expect(pageText).not.toContain('consentEnriched');
  });

  it('shows contact info disclaimer text', async () => {
    await renderProfilePage();

    expect(
      screen.getByText(
        'Contact details are only available to registered users who have verified their identity.',
      ),
    ).toBeInTheDocument();
  });

  it('renders profile info section with location label', async () => {
    await renderProfilePage();

    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Experience Level')).toBeInTheDocument();
    expect(screen.getByText('Member Since')).toBeInTheDocument();
  });

  it('renders "Unknown Profession" fallback when profession is null', async () => {
    mockProfileReturn = {
      data: { ...sampleProfile, profession: null },
      isLoading: false,
      error: null,
    };
    await renderProfilePage();

    expect(screen.getByText('Unknown Profession')).toBeInTheDocument();
  });

  it('does not render portfolio link for javascript: protocol URLs (XSS prevention)', async () => {
    mockProfileReturn = {
      data: { ...sampleProfile, portfolioUrl: 'javascript:alert(1)' },
      isLoading: false,
      error: null,
    };
    await renderProfilePage();

    expect(screen.queryByTestId('portfolio-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-portfolio')).toBeInTheDocument();
  });

  it('back button navigates to /marketplace deterministically', async () => {
    await renderProfilePage();

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    expect(screen.getByTestId('marketplace-search')).toBeInTheDocument();
  });

  // ── Contact Reveal Flow Tests ────────────────────────────────────────────

  describe('contact reveal flow', () => {
    beforeEach(() => {
      mockAuthReturn = {
        isAuthenticated: true,
        user: { id: '1', role: 'public_user' },
      };
    });

    it('shows hCaptcha widget when authenticated user clicks Reveal Contact', async () => {
      await renderProfilePage();

      const button = screen.getByTestId('reveal-contact-authenticated');
      fireEvent.click(button);

      expect(screen.getByTestId('captcha-widget')).toBeInTheDocument();
      expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
      expect(screen.getByText('Please complete the verification to view contact details.')).toBeInTheDocument();
    });

    it('calls revealContact mutation after CAPTCHA solve', async () => {
      await renderProfilePage();

      const button = screen.getByTestId('reveal-contact-authenticated');
      fireEvent.click(button);

      const solveButton = screen.getByTestId('captcha-solve');
      fireEvent.click(solveButton);

      expect(mockRevealMutation.mutate).toHaveBeenCalledWith(
        { profileId: '018e1234-5678-7000-8000-000000000001', captchaToken: 'test-captcha-token' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('displays PII after successful reveal', async () => {
      mockRevealMutation.mutate = vi.fn().mockImplementation((_args, options) => {
        options.onSuccess({ firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' });
      });

      await renderProfilePage();

      const button = screen.getByTestId('reveal-contact-authenticated');
      fireEvent.click(button);
      fireEvent.click(screen.getByTestId('captcha-solve'));

      expect(screen.getByTestId('contact-revealed')).toBeInTheDocument();
      expect(screen.getByText('Contact Details Revealed')).toBeInTheDocument();
      expect(screen.getByText('Adebayo Ogunlesi')).toBeInTheDocument();
      expect(screen.getByText('+2348012345678')).toBeInTheDocument();
    });

    it('shows "Not provided" when PII fields are null', async () => {
      mockRevealMutation.mutate = vi.fn().mockImplementation((_args, options) => {
        options.onSuccess({ firstName: null, lastName: null, phoneNumber: null });
      });

      await renderProfilePage();

      fireEvent.click(screen.getByTestId('reveal-contact-authenticated'));
      fireEvent.click(screen.getByTestId('captcha-solve'));

      const notProvidedElements = screen.getAllByText('Not provided');
      expect(notProvidedElements.length).toBeGreaterThanOrEqual(2);
    });

    it('shows consent-denied message on 404 error', async () => {
      const { ApiError } = await import('../../../lib/api-client');
      mockRevealMutation.mutate = vi.fn().mockImplementation((_args, options) => {
        options.onError(new ApiError('Not found', 404, 'NOT_FOUND'));
      });

      await renderProfilePage();

      fireEvent.click(screen.getByTestId('reveal-contact-authenticated'));
      fireEvent.click(screen.getByTestId('captcha-solve'));

      expect(screen.getByTestId('reveal-error')).toBeInTheDocument();
      expect(screen.getByText('This worker has not opted in to share contact details.')).toBeInTheDocument();
    });

    it('shows rate limit message on 429 error', async () => {
      const { ApiError } = await import('../../../lib/api-client');
      mockRevealMutation.mutate = vi.fn().mockImplementation((_args, options) => {
        options.onError(new ApiError('Rate limited', 429, 'REVEAL_LIMIT_EXCEEDED'));
      });

      await renderProfilePage();

      fireEvent.click(screen.getByTestId('reveal-contact-authenticated'));
      fireEvent.click(screen.getByTestId('captcha-solve'));

      expect(screen.getByTestId('reveal-error')).toBeInTheDocument();
      expect(
        screen.getByText("You've reached the daily limit of 50 contact reveals. Please try again tomorrow."),
      ).toBeInTheDocument();
    });

    it('resets to idle state when CAPTCHA expires', async () => {
      await renderProfilePage();

      fireEvent.click(screen.getByTestId('reveal-contact-authenticated'));
      expect(screen.getByTestId('captcha-widget')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('captcha-expire'));

      // Should be back to idle — button visible, captcha gone
      expect(screen.getByTestId('reveal-contact-authenticated')).toBeInTheDocument();
      expect(screen.queryByTestId('captcha-widget')).not.toBeInTheDocument();
    });

    it('shows error and resets captcha on CAPTCHA widget error', async () => {
      await renderProfilePage();

      fireEvent.click(screen.getByTestId('reveal-contact-authenticated'));
      fireEvent.click(screen.getByTestId('captcha-error'));

      expect(screen.getByTestId('reveal-error')).toBeInTheDocument();
      expect(screen.getByText('Verification failed. Please try again.')).toBeInTheDocument();
    });
  });
});

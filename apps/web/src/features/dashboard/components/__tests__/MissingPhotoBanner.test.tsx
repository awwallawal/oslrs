// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

const { mockFetchProfile } = vi.hoisted(() => ({ mockFetchProfile: vi.fn() }));

vi.mock('../../api/profile.api', () => ({
  fetchProfile: mockFetchProfile,
}));

import { MissingPhotoBanner } from '../MissingPhotoBanner';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MissingPhotoBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const profile = (overrides?: Record<string, unknown>) => ({
  id: 'u1',
  email: 'e@x.com',
  fullName: 'Field Officer',
  phone: null,
  status: 'active',
  lgaId: null,
  lgaName: null,
  roleName: 'enumerator',
  homeAddress: null,
  bankName: null,
  accountNumber: null,
  accountName: null,
  nextOfKinName: null,
  nextOfKinPhone: null,
  liveSelfieOriginalUrl: null,
  liveSelfieIdCardUrl: null,
  photoStatus: null,
  photoFailureReason: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

/**
 * Story 13-60 AC2.2 — the prompt that makes the remedy reachable.
 *
 * `/profile-completion` already existed and already worked; it was simply
 * invisible unless you knew the URL. The whole value of this banner is WHO
 * sees it, so the role-scoping tests are the load-bearing ones — a banner
 * shown to everybody becomes wallpaper and protects nobody.
 */
describe('MissingPhotoBanner (13-60 AC2.2)', () => {
  it('prompts a field officer who has no ID-card photo', async () => {
    mockFetchProfile.mockResolvedValue(profile());
    renderBanner();
    expect(await screen.findByText(/staff ID card needs a photo/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add your photo/i })).toHaveAttribute(
      'href',
      '/profile-completion',
    );
  });

  it('says the photo FAILED when it failed — not just that one is missing', async () => {
    // A person whose upload threw is in a different situation from one who
    // chose to skip, and telling them "you need a photo" would imply they
    // simply had not bothered.
    mockFetchProfile.mockResolvedValue(profile({ photoStatus: 'failed' }));
    renderBanner();
    expect(await screen.findByText(/Your photo did not save/i)).toBeInTheDocument();
  });

  it('stays silent once they have a photo', async () => {
    mockFetchProfile.mockResolvedValue(
      profile({ liveSelfieIdCardUrl: 'staff-photos/id-card/x.jpg', photoStatus: 'saved' }),
    );
    const { container } = renderBanner();
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * ⛔ These two are why the role check is an ALLOW-LIST, not an exclusion.
   * Public users share this same DashboardLayout: an exclusion list would have
   * shipped a "your staff ID card needs a photo" banner to every citizen on the
   * register the moment someone added a role.
   */
  it('never nags a PUBLIC USER — citizens have no staff ID card at all', async () => {
    mockFetchProfile.mockResolvedValue(profile({ roleName: 'public_user' }));
    const { container } = renderBanner();
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('never nags BACK-OFFICE staff — activation skips the selfie step for them', async () => {
    mockFetchProfile.mockResolvedValue(profile({ roleName: 'super_admin' }));
    const { container } = renderBanner();
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

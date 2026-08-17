// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────
const mockProfileResult = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  error: null as any,
}));

const mockMutate = vi.hoisted(() => vi.fn());
const mockMutationResult = vi.hoisted(() => ({
  mutate: mockMutate,
  isPending: false,
}));

vi.mock('../../hooks/useProfile', () => ({
  useProfile: () => mockProfileResult,
  useUpdateProfile: () => mockMutationResult,
  profileKeys: { profile: ['users', 'profile'] },
}));

vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@test.com', fullName: 'Test User', role: 'super_admin', status: 'active' },
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonForm: ({ fields }: { fields: number }) => <div data-testid="skeleton-form">Loading {fields} fields</div>,
}));

vi.mock('@oslsr/types', () => ({
  getRoleDisplayName: (role: string) => role === 'super_admin' ? 'Super Admin' : role,
}));

/*
 * Story 13-59 (review M5) — the artefact panel is real here, its network is not.
 *
 * AC6.1 makes this page the CANONICAL home for both artefacts, and AC6.2 has the
 * enumerator sidebar link at `#id-and-briefing` rather than re-implementing the
 * panel. Before this review the sidebar test pinned the href pointing AT that
 * anchor and nothing asserted anything answered to it — a link verified at the
 * source and never at the target, which is the exact shape of the dead
 * `/users/id-card` this story found.
 */
const { mockFetchArtefactState } = vi.hoisted(() => ({
  mockFetchArtefactState: vi.fn(),
}));
vi.mock('../../api/artefacts.api', () => ({
  fetchArtefactState: mockFetchArtefactState,
  downloadArtefact: vi.fn(),
}));

// Mock react-hook-form for the edit form tests
vi.mock('../../components/ProfileEditForm', () => ({
  default: ({ onCancel, onSave, isSaving }: any) => (
    <div data-testid="profile-edit-form">
      <button onClick={onCancel} disabled={isSaving}>Cancel</button>
      <button onClick={() => onSave({ fullName: 'New Name' })} disabled={isSaving}>Save Changes</button>
    </div>
  ),
}));

/*
 * Story 13-59 — router-aware from here on. ProfilePage now hosts the canonical
 * "My ID & Field Briefing" section (AC6.1), which renders a `<Link>` to 13-60's
 * photo retry and reads `useLocation()` so the sidebar's `#id-and-briefing`
 * link actually scrolls somewhere. Both need router context, so the harness
 * moves from `renderWithQueryClient` to `renderWithRouter` (same QueryClient
 * setup, plus a MemoryRouter with the v7 future flags).
 */
import { renderWithRouter as renderWithQueryClient } from '../../../../test-utils';
import ProfilePage from '../ProfilePage';

// ── Mock data ───────────────────────────────────────────────────────
const mockProfile = {
  id: 'u1',
  email: 'test@test.com',
  fullName: 'Test User',
  phone: '08012345678',
  status: 'active',
  lgaId: 'lga-1',
  lgaName: 'Ibadan North',
  roleName: 'super_admin',
  homeAddress: '123 Test Street',
  bankName: 'GTBank',
  accountNumber: '1234567890',
  accountName: 'Test Account',
  nextOfKinName: 'Jane Doe',
  nextOfKinPhone: '08087654321',
  liveSelfieOriginalUrl: null,
  createdAt: '2026-01-15T10:00:00.000Z',
};

// ── Helpers ─────────────────────────────────────────────────────────
function renderPage() {
  return renderWithQueryClient(<ProfilePage />);
}

// ── Setup ───────────────────────────────────────────────────────────
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockProfileResult.data = mockProfile;
  mockProfileResult.isLoading = false;
  mockProfileResult.error = null;
  mockMutationResult.isPending = false;
});

// ── Tests ───────────────────────────────────────────────────────────
describe('ProfilePage', () => {
  describe('View Mode', () => {
    it('renders profile heading', () => {
      renderPage();
      expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    });

    it('renders full name', () => {
      renderPage();
      // Full name appears in header and field
      expect(screen.getAllByText('Test User').length).toBeGreaterThanOrEqual(1);
    });

    it('renders email', () => {
      renderPage();
      // Email appears in header and field
      expect(screen.getAllByText('test@test.com').length).toBeGreaterThanOrEqual(1);
    });

    it('renders phone number', () => {
      renderPage();
      expect(screen.getByText('08012345678')).toBeInTheDocument();
    });

    it('renders role as display name', () => {
      renderPage();
      // "Super Admin" appears in both badge and field - at least one exists
      expect(screen.getAllByText('Super Admin').length).toBeGreaterThanOrEqual(1);
    });

    it('renders resolved LGA name', () => {
      renderPage();
      expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    });

    it('renders account status badge', () => {
      renderPage();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders member since date', () => {
      renderPage();
      // The exact format depends on locale, but should contain January 2026
      expect(screen.getByText(/January/)).toBeInTheDocument();
    });

    it('renders bank details', () => {
      renderPage();
      expect(screen.getByText('GTBank')).toBeInTheDocument();
      expect(screen.getByText('1234567890')).toBeInTheDocument();
    });

    it('renders next of kin info', () => {
      renderPage();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('renders initials avatar when no selfie', () => {
      renderPage();
      expect(screen.getByText('TU')).toBeInTheDocument(); // Test User initials
    });

    it('renders Edit Profile button', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows skeleton when loading', () => {
      mockProfileResult.isLoading = true;
      mockProfileResult.data = null;
      renderPage();
      expect(screen.getByTestId('skeleton-form')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message when profile fails to load', () => {
      mockProfileResult.error = new Error('fetch failed');
      mockProfileResult.data = null;
      renderPage();
      expect(screen.getByText(/unable to load profile/i)).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('switches to edit form when Edit Profile is clicked', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.getByTestId('profile-edit-form')).toBeInTheDocument();
    });

    it('returns to view mode when Cancel is clicked', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByTestId('profile-edit-form')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });

    it('calls mutation with data when Save Changes is clicked', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(mockMutate).toHaveBeenCalledWith(
        { fullName: 'New Name' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  /**
   * Story 13-59 AC6.1/AC6.2 (review M5) — the canonical home, asserted at the
   * TARGET end of the link for the first time.
   */
  describe('My ID & Field Briefing section (Story 13-59)', () => {
    const entitled = {
      idCard: { applicable: true, available: true, unavailableReason: null, downloadedAt: null },
      briefing: { applicable: true, available: true, unavailableReason: null, downloadedAt: null },
      promptRequired: true,
    };
    const entitledToNothing = {
      idCard: { applicable: false, available: false, unavailableReason: null, downloadedAt: null },
      briefing: { applicable: false, available: false, unavailableReason: null, downloadedAt: null },
      promptRequired: false,
    };

    it('AC6.2 — carries the #id-and-briefing anchor the sidebar entry links to', async () => {
      mockFetchArtefactState.mockResolvedValue(entitled);
      renderPage();

      // `sidebarConfig.test.ts` pins the href as
      // '/dashboard/enumerator/profile#id-and-briefing'. This is the other half:
      // something on this page actually answers to that fragment.
      //
      // ⚠️ Reached by test id, then asserted on the `id` ATTRIBUTE — Team
      // Agreement A3 forbids querying by CSS id, and it is right to: the anchor
      // is what the link needs, not what the test needs to find the element.
      expect(screen.getByTestId('id-and-briefing-section')).toHaveAttribute(
        'id',
        'id-and-briefing',
      );
    });

    it('AC6.1 — renders both artefacts for a field role', async () => {
      mockFetchArtefactState.mockResolvedValue(entitled);
      renderPage();

      expect(await screen.findByText(/My ID & Field Briefing/i)).toBeInTheDocument();
      expect(screen.getByText(/Staff ID card/i)).toBeInTheDocument();
      expect(screen.getByText(/Enumerator field briefing/i)).toBeInTheDocument();
    });

    /**
     * ⭐ Review M1 — the regression this exists to prevent.
     *
     * The heading used to live on this page, above the panel, and render
     * unconditionally. For every back-office role and every citizen the panel
     * returns null, so they were shown "My ID & Field Briefing / Save these to
     * your phone" with nothing underneath — an instruction to save files that do
     * not exist for them. The anchor stays (the link must still land); the
     * heading leaves with its content.
     */
    it('M1 — shows NO heading for a role entitled to neither artefact', async () => {
      mockFetchArtefactState.mockResolvedValue(entitledToNothing);
      renderPage();

      await waitFor(() => expect(mockFetchArtefactState).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.queryByText(/My ID & Field Briefing/i)).not.toBeInTheDocument(),
      );
      // The anchor survives — an empty section is invisible, a heading without
      // its content is not.
      expect(screen.getByTestId('id-and-briefing-section')).toBeInTheDocument();
    });
  });
});

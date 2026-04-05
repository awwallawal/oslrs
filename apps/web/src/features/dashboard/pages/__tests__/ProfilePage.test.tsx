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

// Mock react-hook-form for the edit form tests
vi.mock('../../components/ProfileEditForm', () => ({
  default: ({ onCancel, onSave, isSaving }: any) => (
    <div data-testid="profile-edit-form">
      <button onClick={onCancel} disabled={isSaving}>Cancel</button>
      <button onClick={() => onSave({ fullName: 'New Name' })} disabled={isSaving}>Save Changes</button>
    </div>
  ),
}));

import { renderWithQueryClient } from '../../../../test-utils';
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
});

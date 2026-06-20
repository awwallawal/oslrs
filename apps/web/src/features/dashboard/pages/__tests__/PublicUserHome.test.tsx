// @vitest-environment jsdom
/**
 * PublicUserHome tests — Story 9-40 registration-status state machine.
 *
 * Covers the four read-model states (none / draft / pending_nin / complete),
 * loading + error, the magic-link re-entry (AC#3), the read-only summary +
 * marketplace status + inline consent edit (AC#4/#5).
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import type { RegistrationStatusReadModel } from '../../api/me.api';

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}));

let mockStatus: {
  data: RegistrationStatusReadModel | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
let mockMutationPending = false;

vi.mock('../../hooks/useRegistrationStatus', () => ({
  useRegistrationStatus: () => mockStatus,
  meKeys: { registrationStatus: () => ['me', 'registration-status'] },
}));

vi.mock('../../hooks/useUpdateMarketplaceConsent', () => ({
  useUpdateMarketplaceConsent: () => ({ mutate: mockMutate, isPending: mockMutationPending }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: ({ className }: { className?: string }) => (
    <div aria-label="Loading card" className={className} />
  ),
}));

import PublicUserHome from '../PublicUserHome';

afterEach(() => cleanup());

function renderComponent() {
  return render(
    <MemoryRouter>
      <PublicUserHome />
    </MemoryRouter>,
  );
}

const refetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockMutationPending = false;
  mockStatus = { data: { state: 'none' }, isLoading: false, isError: false, refetch };
});

describe('PublicUserHome (Story 9-40)', () => {
  it('renders the dashboard heading', () => {
    renderComponent();
    expect(screen.getByText('My Dashboard')).toBeInTheDocument();
  });

  describe('AC#2 loading + error', () => {
    it('shows skeleton cards while loading', () => {
      mockStatus = { data: undefined, isLoading: true, isError: false, refetch };
      renderComponent();
      expect(screen.getAllByLabelText('Loading card').length).toBeGreaterThanOrEqual(1);
    });

    it('shows an error fallback with retry that refetches', async () => {
      mockStatus = { data: undefined, isLoading: false, isError: true, refetch };
      renderComponent();
      expect(screen.getByTestId('reg-status-error')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('reg-status-retry'));
      expect(refetch).toHaveBeenCalled();
    });
  });

  describe('AC#1 four states', () => {
    it('state=none → Start registration → /register', () => {
      mockStatus = { data: { state: 'none' }, isLoading: false, isError: false, refetch };
      renderComponent();
      expect(screen.getByTestId('reg-state-none')).toBeInTheDocument();
      expect(screen.getByTestId('start-registration')).toHaveAttribute('href', '/register');
      // The legacy hardcoded mock is gone.
      expect(screen.queryByText('2 of 5 steps complete')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Start Survey' })).toBeNull();
    });

    it('state=draft → links to the in-session wizard /registration/manage (AC#3/9-61)', () => {
      mockStatus = {
        data: { state: 'draft', draftStep: 3 },
        isLoading: false,
        isError: false,
        refetch,
      };
      renderComponent();
      expect(screen.getByTestId('reg-state-draft')).toHaveTextContent(/step 3/i);
      expect(screen.getByTestId('resume-draft')).toHaveAttribute('href', '/registration/manage');
    });

    it('state=pending_nin → shows reference + links to /registration/manage (AC#3/9-61)', () => {
      mockStatus = {
        data: {
          state: 'pending_nin',
          respondent: {
            id: 'r1',
            status: 'pending_nin_capture',
            lgaId: 'ibadan-north',
            lgaName: 'Ibadan North',
            ninStatus: 'pending',
            consentMarketplace: false,
            referenceCode: 'OSL-2026-ABC123',
          },
        },
        isLoading: false,
        isError: false,
        refetch,
      };
      renderComponent();
      expect(screen.getByTestId('reg-state-pending-nin')).toHaveTextContent('OSL-2026-ABC123');
      expect(screen.getByTestId('resume-pending-nin')).toHaveAttribute('href', '/registration/manage');
    });

    it('state=complete → read-only summary + marketplace (AC#4/#5)', () => {
      mockStatus = {
        data: {
          state: 'complete',
          respondent: {
            id: 'r1',
            status: 'active',
            lgaId: 'ibadan-north',
            lgaName: 'Ibadan North',
            ninStatus: 'provided',
            consentMarketplace: false,
            referenceCode: 'OSL-2026-XYZ789',
          },
        },
        isLoading: false,
        isError: false,
        refetch,
      };
      renderComponent();
      expect(screen.getByTestId('registration-summary')).toBeInTheDocument();
      expect(screen.getByTestId('summary-reference')).toHaveTextContent('OSL-2026-XYZ789');
      expect(screen.getByTestId('summary-nin-status')).toHaveTextContent('Provided');
      // Story 9-61 — server-resolved human LGA name renders (not the raw slug).
      expect(screen.getByTestId('summary-lga')).toHaveTextContent('Ibadan North');
      expect(screen.getByTestId('marketplace-status')).toHaveTextContent(/not opted in/i);
      // Story 9-61 — in-session edit entry point (replaces 9-40's /check-registration link).
      expect(screen.getByTestId('edit-registration')).toHaveAttribute('href', '/registration/manage');
    });
  });

  describe('AC#4 inline marketplace consent edit', () => {
    function renderComplete(consentMarketplace: boolean) {
      mockStatus = {
        data: {
          state: 'complete',
          respondent: {
            id: 'r1',
            status: 'active',
            lgaId: 'ibadan-north',
            lgaName: 'Ibadan North',
            ninStatus: 'provided',
            consentMarketplace,
            referenceCode: 'OSL-1',
          },
        },
        isLoading: false,
        isError: false,
        refetch,
      };
      renderComponent();
    }

    it('opts in when currently opted out', async () => {
      renderComplete(false);
      expect(screen.getByTestId('marketplace-toggle')).toHaveTextContent(/opt in/i);
      await userEvent.click(screen.getByTestId('marketplace-toggle'));
      expect(mockMutate).toHaveBeenCalledWith({ consentMarketplace: true });
    });

    it('opts out when currently opted in', async () => {
      renderComplete(true);
      expect(screen.getByTestId('marketplace-status')).toHaveTextContent(/opted in/i);
      expect(screen.getByTestId('marketplace-toggle')).toHaveTextContent(/opt out/i);
      await userEvent.click(screen.getByTestId('marketplace-toggle'));
      expect(mockMutate).toHaveBeenCalledWith({ consentMarketplace: false });
    });
  });
});
